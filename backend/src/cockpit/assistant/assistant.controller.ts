import { span, traced, traceMeta } from '../../core/trace';
import { Body, Controller, HttpCode, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { JevPromptService } from '../../core/jev-prompt.service';
import { stripMarkdownLinks } from '../../domain/jev-prompt';
import { LATENCY_SERVICE_MODEL, latencyCategory, latencyUnserved, measuredPrompt, recordRoute, timedStep } from '../../core/latency';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AccessService, ProjectScope } from '../../core/access.service';
import { Actor, CurrentActor } from '../../core/auth/auth';
import { PrismaService } from '../../core/prisma.service';
import { StorageService } from '../../core/storage.service';
import { LlmService } from '../../core/llm.service';
import { badRequest, businessRule, conflict, forbidden, notFound } from '../../core/errors';
import { parse } from '../../core/http';
import { canReadWs } from '../../domain/rights';
import { parseFrLabel } from '../../domain/dates';
import { ACTIONS, DECISIONS, ISSUES, RISKS, TransactionalService, TxEntity } from '../pilotage/transactional';
import type { UploadedBlob } from '../../import/import.controller';
import { JevRouterService } from '../../admin/jev-router.service';
import { GuideAnswerService } from '../../admin/guide-answer.service';
import { TodayService } from '../../core/today.service';
import { COCKPIT_CASE_ROUTE, COCKPIT_CHOICE_TO_CASE } from '../../domain/jev-router-cockpit';
import { clarifyReasonOf, COCKPIT_CLARIFY_RULES, cockpitClarifyPrompt, cockpitPageLabel, nowParisLabel } from '../../domain/jev-cockpit-answers';
import { JevCockpitWriteService, WriteOutcome } from './jev-cockpit-write.service';
import { JEV_WRITABLE_DEFS, JEV_REF_DEFS } from './jev-writable';
import { ReferentialService } from '../referential/referential.service';
import { EntityConfig } from '../referential/entities';
import { linkedActionDue, WRITE_ENTITY_LABEL, WriteEntity } from '../../domain/jev-cockpit-write';
import { JevMemoryService } from '../../admin/jev-memory.service';
import { JevConversation } from '@prisma/client';
import { ChatTurn } from '../../core/llm-client';
import { JevCockpitInsightService } from '../../admin/jev-cockpit-insight.service';
import { JevCockpitDocsService } from './jev-cockpit-docs.service';
import { requestContext } from '../../domain/jev-sql';

/** Jev ne modifie jamais le Référentiel, les Comités et rapports, ni la Base de connaissance (§ 7.14). */
export const JEV_WRITABLE: Record<string, TxEntity> = JEV_WRITABLE_DEFS;

const Message = z
  .object({
    context: z.object({ space: z.string().max(40), tab: z.string().max(40).optional(), block: z.string().max(80).optional(), rowId: z.string().max(80).optional() }).strict(),
    text: z.string().trim().min(1).max(4000),
    fileIds: z.array(z.string()).max(10).default([]),
    /** Conversation en cours (mémoire) ; absente : nouvelle conversation. */
    conversationId: z.string().max(60).optional(),
    /** Réponse à la question à choix de Jev (cas 3), ou annulation de la demande en cours. */
    answer: z.union([z.object({ value: z.union([z.string().max(200), z.number(), z.null(), z.array(z.string().max(200)).max(50)]) }).strict(), z.object({ cancel: z.literal(true) }).strict()]).optional(),
  })
  .strict();

const Confirm = z.object({ confirmCode: z.string().max(20).optional() }).strict();

/** Réponse de Jev (avant enregistrement dans la mémoire). */
interface JevReply { reply: string; route: string; sources: Array<{ entityType: string; id: string; label: string }>; proposedChanges: unknown[]; model: { id: string; fallbackUsed: boolean } | null; [k: string]: unknown }

/**
 * Assistant Jev du Cockpit (brief « Aiguillage des questions dans l'assistant JEV », 01/10/2026) : chaque question est
 * classée en 5 cas d'usage, traitée par le modèle et la skill de son cas, dans une conversation qui garde la mémoire
 * des échanges (comme la Console). Cas 3 : rien n'est enregistré avant la confirmation du récapitulatif ; une
 * modification validée suit les mêmes droits et validations qu'une saisie manuelle (origine JEV).
 */
@ApiTags('cockpit · assistant Jev')
@ApiBearerAuth()
@Controller('api/projects/:projectId/assistant')
export class AssistantController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly tx: TransactionalService,
    private readonly llm: LlmService,
    private readonly storage: StorageService,
    private readonly jev: JevPromptService,
    private readonly router: JevRouterService,
    private readonly guide: GuideAnswerService,
    private readonly today: TodayService,
    private readonly insight: JevCockpitInsightService,
    private readonly docs: JevCockpitDocsService,
    private readonly write: JevCockpitWriteService,
    private readonly ref: ReferentialService,
    private readonly memory: JevMemoryService,
  ) {}

  @Post('messages')
  @HttpCode(200)
  async message(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Body() body: unknown) {
    // Trace de la question (01/10/2026) : chaque étape chronométrée, de la question à la réponse (journal du serveur,
    // table jev_traces, `npm run jev:traces`). Temps de traitement (TEMPS § 3) : prompt mesuré, catégorie fixée à l'aiguillage.
    return measuredPrompt(() => traced('Jev Cockpit', async () => {
      const scope = await span('projet et droits (base)', () => this.access.scope(actor, p));
      const input = parse(Message, body);
      traceMeta('projet', scope.project.code);
      traceMeta('question', input.text.slice(0, 120));
      // Conversation (mémoire, une par utilisateur et par projet) : celle de l'écran, sinon une nouvelle.
      const { conv, mem } = await span('conversation et mémoire (base)', async () => {
        const conv = input.conversationId
          ? await this.memory.own(actor.accountId, input.conversationId, 'cockpit', scope.project.id)
          : await this.memory.start(actor.accountId, 'cockpit', scope.project.id);
        return { conv, mem: await this.memory.memory(conv) };
      });
      traceMeta('conversation', conv.id);
      const raw = await this.answer(scope, actor, conv, input, mem.history);
      const out = { ...raw, reply: stripMarkdownLinks(raw.reply) };
      traceMeta('cas', out.route);
      await span('enregistrement de l’échange dans la mémoire (base)', () => this.memory.record(conv, input.text, out.reply, out.sources.map((x) => x.label), { route: out.route }));
      return { ...out, conversationId: conv.id };
    }));
  }

  private async answer(scope: ProjectScope, actor: Actor, conv: JevConversation, input: z.infer<typeof Message>, history: ChatTurn[]): Promise<JevReply> {
    const page = cockpitPageLabel(input.context.space, input.context.tab);
    // Réponse à une question à choix du cas 3 : sans aiguillage ni modèle.
    if (input.answer) {
      const w = await this.write.answer(scope, actor, conv, input.answer as any);
      return this.writeReply(w, '3');
    }
    // Aiguillage en 5 cas d'usage (brief du 01/10/2026), questions précédentes comprises ; chaque décision est journalisée.
    const previous = await this.memory.lastQuestions(conv.id, 3);
    const routeStart = new Date();
    const route = await span('aiguillage (API JEV)', async (d) => {
      const r = await this.router.classifyCockpit(input.text, { page: [input.context.space, input.context.tab].filter(Boolean).join(' › '), accountId: actor.accountId, conversationId: conv.id, history: previous.map((q) => ({ question: q.question, cas: (q.route as any) ?? null })) });
      Object.assign(d, { cas: r.cas, confiance: r.confiance, statut: r.status, latence_api_ms: r.latencyMs });
      return r;
    });
    recordRoute(routeStart, route);
    // Modification en cours : une réponse libre la complète ou la corrige (cas 3 ou clarification).
    const pending = !!conv.draft;
    if (route.cas === '3' || (pending && route.cas === '5')) {
      latencyCategory('update_cockpit');
      const w = await span('cas 3 · modification des données', () => this.write.handle(scope, actor, conv, input.text, { page, history }));
      await this.router.noteAnswerModel(route.traceId, w.modelId);
      return this.writeReply(w, '3');
    }
    const context = requestContext(page, this.today.today(), nowParisLabel(this.today.now()));
    // Cas 2 — guide utilisateur du Cockpit : recherche (8 extraits, seuil, reclassement, 4 gardés), rédaction par le
    // modèle de la fonction Guidage avec la seule skill « Guidage Cockpit » (partie stable en cache) ; extraits, section
    // et page dans la partie variable. Sans extrait au-dessus du seuil, Jev le dit sans appeler de modèle.
    if (route.cas === '2') {
      latencyCategory('guide_cockpit');
      const { functionId, skill } = COCKPIT_CASE_ROUTE['2'];
      const parts = await this.jev.cockpitParts(skill, context);
      const g = await span('cas 2 · réponse depuis le guide', () => this.guide.answer('cockpit', input.text, { system: parts.stable, context: parts.page, functionId, projectId: scope.project.id }));
      await this.router.noteAnswerModel(route.traceId, g.modelId ?? null);
      if (g.status === 'UNAVAILABLE') latencyUnserved(g.error ?? 'Recherche dans le guide indisponible');
      return { reply: g.reply, route: route.cas, sources: g.sources.map((label) => ({ entityType: 'GUIDE', id: 'cockpit', label })), proposedChanges: [], model: g.modelId ? { id: g.modelId, fallbackUsed: g.fallbackUsed } : null, guide: g.status };
    }
    // Cas 5 — clarification : demande de précision rédigée par le modèle de la fonction Guidage (proposition du brief),
    // selon le motif (ambigu, hors sujet, confiance insuffisante, écriture incertaine, aiguillage indisponible).
    if (route.cas === '5') {
      const reason = clarifyReasonOf(route);
      const probable = route.choice ? COCKPIT_CHOICE_TO_CASE[route.choice] : null;
      const parts = await this.jev.cockpitParts(COCKPIT_CASE_ROUTE['5'].skill, context);
      const r = await this.llm.complete({
        functionId: COCKPIT_CASE_ROUTE['5'].functionId, source: 'JEV', cache: true, projectId: scope.project.id, history,
        system: `${parts.stable}\n\n${COCKPIT_CLARIFY_RULES}`, systemTail: parts.page, prompt: cockpitClarifyPrompt(input.text, reason, probable),
      });
      await this.router.noteAnswerModel(route.traceId, r.modelId ?? null);
      return { reply: r.text, route: route.cas, reason, sources: [], proposedChanges: [], model: { id: r.modelId, fallbackUsed: r.fallbackUsed } };
    }
    // Cas 1 — données du projet : requête SQL écrite par le modèle Insights (skill « Insights »), exécutée en lecture
    // seule sur les vues jev_cockpit filtrées par les droits de l'utilisateur, puis réponse à partir des résultats.
    if (route.cas === '1') {
      latencyCategory('data_cockpit');
      const { functionId, skill } = COCKPIT_CASE_ROUTE['1'];
      const a = await span('cas 1 · données du projet', () => this.insight.ask(input.text, { project: scope.project, access: scope.access, page, functionId, skill, history }));
      await this.router.noteAnswerModel(route.traceId, a.modelId);
      if (a.status === 'FAILED') latencyUnserved(a.error ?? 'Requête impossible');
      return { reply: a.reply, route: route.cas, insight: a.status, sources: a.sources.map((label) => ({ entityType: 'DATA', id: label, label })), proposedChanges: [], model: a.modelId ? { id: a.modelId, fallbackUsed: a.fallbackUsed } : null };
    }
    // Cas 4 — documents de la Base de connaissance : identification des documents visés, recherche, reclassement,
    // réponse par le modèle Documents / Synthèse (skill « Analyser un document ») ; 4b : données du projet d'abord.
    latencyCategory('kb_document');
    const a = await span(`cas ${route.cas} · documents`, () => this.docs.answer(scope, actor, input.text, { page, withData: route.cas === '4b', history }));
    await this.router.noteAnswerModel(route.traceId, a.modelId);
    return { reply: a.reply, route: route.cas, docs: a.status, insight: a.insight, sources: a.sources, proposedChanges: [], model: a.modelId ? { id: a.modelId, fallbackUsed: a.fallbackUsed } : null };
  }

  private writeReply(w: WriteOutcome, route: string): JevReply {
    return { reply: w.reply, route, write: w.status, choices: w.choices, sources: [], proposedChanges: w.proposedChanges, model: w.modelId ? { id: w.modelId, fallbackUsed: w.fallbackUsed } : null };
  }

  /** Nouvelle conversation (« Effacer tous les messages », réouverture du panneau) : la mémoire repart de zéro. */
  @Post('conversations')
  @HttpCode(201)
  async newConversation(@CurrentActor() actor: Actor, @Param('projectId') p: string) {
    const scope = await this.access.scope(actor, p);
    const c = await this.memory.start(actor.accountId, 'cockpit', scope.project.id);
    return { id: c.id };
  }

  private async change(scope: ProjectScope, actor: Actor, id: string) {
    const c = await this.prisma.assistantChange.findFirst({ where: { id, projectId: scope.project.id, accountId: actor.accountId } });
    if (!c) throw notFound();
    if (c.status !== 'PROPOSED') throw conflict('ALREADY_DECIDED', 'Proposition déjà validée ou refusée');
    return c;
  }

  /**
   * Validation d'une proposition : mêmes droits et validations qu'une saisie manuelle, historique d'origine JEV.
   * Suppression : confirmation renforcée, le code de l'objet doit être retapé (`confirmCode`). Action liée à un nouveau
   * risque : le risque doit avoir été validé avant (son identifiant devient l'origine de l'action).
   */
  @Post('changes/:id/confirm')
  @HttpCode(200)
  async confirm(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string, @Body() body: unknown) {
    // Temps de traitement : la confirmation est un prompt « Actualisation Cockpit » distinct, avec la seule étape
    // Exécution (écriture en base) ; une confirmation refusée avant l'écriture (code à retaper…) n'est pas comptée.
    return measuredPrompt(() => this.confirmMeasured(actor, p, id, body));
  }

  private async confirmMeasured(actor: Actor, p: string, id: string, body: unknown) {
    const scope = await this.access.scope(actor, p);
    const input = parse(Confirm, body ?? {});
    const c = await this.change(scope, actor, id);
    const def = JEV_WRITABLE[c.entityType], refDef = (JEV_REF_DEFS as Record<string, EntityConfig>)[c.entityType];
    if (!def && !refDef) throw forbidden('Jev ne modifie pas ce type de données');
    // Objet du Référentiel (09/10/2026) : service du Référentiel (PMO, contrôle des usages, historique d'origine JEV).
    if (refDef) return this.confirmRef(scope, actor, c, refDef, input);
    const patch: any = { ...(c.patch as any) };
    if (patch.sourceRef) {
      const parent = await this.prisma.assistantChange.findFirst({ where: { id: patch.sourceRef, projectId: scope.project.id, accountId: actor.accountId } });
      if (!parent || parent.status !== 'CONFIRMED' || !parent.entityId) throw businessRule('Validez d’abord le risque : cette action lui est liée', { sourceRef: 'risque non validé' });
      patch.sourceId = parent.entityId;
      delete patch.sourceRef;
      // Action créée avec son risque : sans échéance, celle du risque tel qu'enregistré (copie unique, `linkedActionDue`).
      if (!patch.dueIso && parent.entityType === 'RISK') {
        const risk = await this.prisma.risk.findFirst({ where: { id: parent.entityId, projectId: scope.project.id }, select: { dueIso: true } });
        const due = linkedActionDue(null, risk?.dueIso ?? null);
        if (due) patch.dueIso = due;
      }
    }
    let result: any;
    let code: string | null = null;
    if (c.op === 'DELETE') {
      const row = await (this.prisma as any)[def.delegate].findFirst({ where: { id: c.entityId!, projectId: scope.project.id } });
      if (!row) throw notFound();
      if ((input.confirmCode ?? '').trim().toUpperCase() !== String(row.code).toUpperCase()) throw businessRule(`Pour supprimer, retapez le code ${row.code}`, { confirmCode: `${row.code} attendu` });
      latencyCategory('update_cockpit');
      await timedStep('exe', LATENCY_SERVICE_MODEL, 'primary', () => this.tx.remove(def, actor, scope, c.entityId!));
      result = { id: row.id, code: row.code, deleted: true };
      code = row.code;
    } else {
      latencyCategory('update_cockpit');
      result = await timedStep('exe', LATENCY_SERVICE_MODEL, 'primary', () => (c.op === 'CREATE' ? this.tx.create(def, actor, scope, patch, 'JEV') : this.tx.patch(def, actor, scope, c.entityId!, patch, undefined, 'JEV')));
      code = result?.code ?? result?.id ?? null;
    }
    await this.prisma.assistantChange.update({ where: { id }, data: { status: 'CONFIRMED', decidedAt: new Date(), entityId: result?.id ?? c.entityId } });
    const L = WRITE_ENTITY_LABEL[c.entityType as WriteEntity];
    return { id, status: 'CONFIRMED', result, link: c.op === 'DELETE' ? null : { space: 'pilotage', tab: L.tab, code, label: `Ouvrir ${code} · ${L.tabLabel}` } };
  }

  private async confirmRef(scope: ProjectScope, actor: Actor, c: { id: string; entityType: string; entityId: string | null; op: string; patch: unknown }, def: EntityConfig, input: { confirmCode?: string }) {
    const L = WRITE_ENTITY_LABEL[c.entityType as WriteEntity];
    let result: any;
    let code: string | null = null;
    latencyCategory('update_cockpit');
    if (c.op === 'DELETE') {
      const row = await (this.prisma as any)[def.delegate].findFirst({ where: { id: c.entityId!, projectId: scope.project.id } });
      if (!row) throw notFound();
      // Livrable (sans code) : son nom est à retaper.
      const ref = String(row.code ?? row.name), what = row.code ? 'le code' : 'le nom';
      if ((input.confirmCode ?? '').trim().toUpperCase() !== ref.trim().toUpperCase()) throw businessRule(`Pour supprimer, retapez ${what} ${ref}`, { confirmCode: `${ref} attendu` });
      await timedStep('exe', LATENCY_SERVICE_MODEL, 'primary', () => this.ref.remove(def, actor, scope, c.entityId!, undefined, 'JEV'));
      result = { id: row.id, code: ref, deleted: true };
      code = ref;
    } else {
      result = await timedStep('exe', LATENCY_SERVICE_MODEL, 'primary', () => (c.op === 'CREATE' ? this.ref.create(def, actor, scope, c.patch, 'JEV') : this.ref.patch(def, actor, scope, c.entityId!, c.patch, undefined, 'JEV')));
      code = result?.code ?? result?.name ?? result?.id ?? null;
    }
    await this.prisma.assistantChange.update({ where: { id: c.id }, data: { status: 'CONFIRMED', decidedAt: new Date(), entityId: result?.id ?? c.entityId } });
    return { id: c.id, status: 'CONFIRMED', result, link: c.op === 'DELETE' ? null : { space: L.space ?? 'projet', tab: L.tab, code, label: `Ouvrir ${code} · ${L.tabLabel}` } };
  }

  @Post('changes/:id/reject')
  @HttpCode(200)
  async reject(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string) {
    const scope = await this.access.scope(actor, p);
    await this.change(scope, actor, id);
    await this.prisma.assistantChange.update({ where: { id }, data: { status: 'REJECTED', decidedAt: new Date() } });
    return { id, status: 'REJECTED' };
  }

  @Post('files')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async file(@CurrentActor() actor: Actor, @Param('projectId') p: string, @UploadedFile() file: UploadedBlob | undefined) {
    const scope = await this.access.scope(actor, p);
    if (!file) throw badRequest('Fichier manquant', { file: 'obligatoire' });
    const key = await this.storage.put(`assistant/${scope.project.id}`, file.buffer, (/\.[a-z0-9]+$/i.exec(file.originalname)?.[0] ?? '').toLowerCase());
    const f = await this.prisma.assistantFile.create({ data: { projectId: scope.project.id, accountId: actor.accountId, name: file.originalname, mime: file.mimetype, fileKey: key, status: 'READY' } });
    return { id: f.id, status: f.status, name: f.name };
  }

}
