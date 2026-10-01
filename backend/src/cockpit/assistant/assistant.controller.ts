import { Body, Controller, HttpCode, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { JevPromptService } from '../../core/jev-prompt.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AccessService, ProjectScope } from '../../core/access.service';
import { Actor, CurrentActor } from '../../core/auth/auth';
import { PrismaService } from '../../core/prisma.service';
import { StorageService } from '../../core/storage.service';
import { LlmService } from '../../core/llm.service';
import { badRequest, conflict, forbidden, notFound } from '../../core/errors';
import { parse } from '../../core/http';
import { canReadWs } from '../../domain/rights';
import { parseFrLabel } from '../../domain/dates';
import { ACTIONS, DECISIONS, ISSUES, RISKS, TransactionalService, TxEntity } from '../pilotage/transactional';
import type { UploadedBlob } from '../../import/import.controller';
import { JevRouterService } from '../../admin/jev-router.service';
import { GuideAnswerService } from '../../admin/guide-answer.service';

/** Jev ne modifie jamais le Référentiel, les Comités et rapports, ni la Base de connaissance (§ 7.14). */
export const JEV_WRITABLE: Record<string, TxEntity> = { RISK: RISKS, ISSUE: ISSUES, ACTION: ACTIONS, DECISION: DECISIONS };
const READ_ONLY_TABS = ['referentiel'];
const READ_ONLY_SPACES = ['comites', 'documents'];

const Message = z
  .object({
    context: z.object({ space: z.string().max(40), tab: z.string().max(40).optional(), block: z.string().max(80).optional(), rowId: z.string().max(80).optional() }).strict(),
    text: z.string().trim().min(1).max(4000),
    fileIds: z.array(z.string()).max(10).default([]),
  })
  .strict();

const STATUS_WORDS: Array<[RegExp, Record<string, string>]> = [
  [/termin|fait|clos|clôtur/i, { ACTION: 'DONE', RISK: 'CLOSED', ISSUE: 'RESOLVED' }],
  [/en cours|démarr/i, { ACTION: 'IN_PROGRESS', ISSUE: 'RESOLVING' }],
  [/bloqu/i, { ACTION: 'BLOCKED' }],
  [/mitig/i, { RISK: 'MITIGATING' }],
  [/rouvr|ouvert/i, { ACTION: 'OPEN', RISK: 'OPEN', ISSUE: 'OPEN' }],
];

/**
 * Assistant Jev (brief § 7.14, § 9.10) — service bouchon.
 * Jev propose, l'utilisateur valide le récapitulatif : rien n'est enregistré avant `confirm`.
 * Une modification validée suit les mêmes droits et validations qu'une saisie manuelle (origine JEV).
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
  ) {}

  private entityOf(code: string): { type: string; def: TxEntity } | null {
    if (/^A-\d+$/i.test(code)) return { type: 'ACTION', def: ACTIONS };
    if (/^R\d+$/i.test(code)) return { type: 'RISK', def: RISKS };
    if (/^P\d+$/i.test(code)) return { type: 'ISSUE', def: ISSUES };
    if (/^D-\d+$/i.test(code)) return { type: 'DECISION', def: DECISIONS };
    return null;
  }

  @Post('messages')
  @HttpCode(200)
  async message(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Body() body: unknown) {
    const scope = await this.access.scope(actor, p);
    const input = parse(Message, body);
    // Question d'usage (aiguillage par l'API de JEV, périmètre du Cockpit) : réponse à partir du seul guide du Cockpit,
    // avec ses réglages ; sans guide publié, Jev le dit sans appeler de modèle (décision du 30/09/2026).
    // Aiguillage en 5 cas d'usage (brief du 01/10/2026) ; chaque décision est journalisée (jev_classifications).
    const route = await this.router.classifyCockpit(input.text, { page: [input.context.space, input.context.tab].filter(Boolean).join(' › '), accountId: actor.accountId });
    if (route.cas === '2') {
      const g = await this.guide.answer('cockpit', input.text, { system: await this.jev.systemPrompt(), projectId: scope.project.id });
      await this.router.noteAnswerModel(route.traceId, g.modelId ?? null);
      return { reply: g.reply, sources: g.sources.map((label) => ({ entityType: 'GUIDE', id: 'cockpit', label })), proposedChanges: [], model: g.modelId ? { id: g.modelId, fallbackUsed: g.fallbackUsed } : null, route: route.cas, guide: g.status };
    }
    const readOnly = READ_ONLY_SPACES.includes(input.context.space) || READ_ONLY_TABS.includes(input.context.tab ?? '');
    const codes = [...new Set(input.text.match(/\b(A-\d+|R\d{2,}|P\d{2,}|D-\d{3}|J\d{2,})\b/gi) ?? [])].map((c) => c.toUpperCase());
    const sources: Array<{ entityType: string; id: string; label: string }> = [];
    for (const c of codes) {
      const e = this.entityOf(c);
      if (e) {
        const row = await (this.prisma as any)[e.def.delegate].findFirst({ where: { projectId: scope.project.id, code: c } });
        if (row && canReadWs(scope.access, row.wsId)) sources.push({ entityType: e.type, id: row.id, label: e.def.label(row) });
      } else if (/^J/.test(c)) {
        const m = await this.prisma.milestone.findFirst({ where: { projectId: scope.project.id, code: c } });
        if (m) sources.push({ entityType: 'MILESTONE', id: m.id, label: `${m.code} · ${m.n}` });
      }
    }
    for (const fid of input.fileIds) {
      const f = await this.prisma.assistantFile.findFirst({ where: { id: fid, accountId: actor.accountId } });
      if (f) sources.push({ entityType: 'ASSISTANT_FILE', id: f.id, label: f.name });
    }

    const proposals = readOnly ? [] : await this.propose(scope, input.text, sources);
    const llm = await this.llm.complete({ functionId: proposals.length ? 'crud' : 'insights', prompt: `[${input.context.space}/${input.context.tab ?? ''}] ${input.text}`, system: await this.jev.systemPrompt(), projectId: scope.project.id, source: 'JEV' });
    const created = [];
    for (const pr of proposals) {
      created.push(
        await this.prisma.assistantChange.create({
          data: { projectId: scope.project.id, accountId: actor.accountId, entityType: pr.entityType, entityId: pr.entityId, op: pr.op, patch: pr.patch, summary: pr.summary },
        }),
      );
    }
    const reply = readOnly
      ? 'Je peux expliquer cet écran, mais je ne modifie ni le Référentiel, ni les Comités et rapports, ni la Base de connaissance.'
      : created.length
        ? `Voici ${created.length > 1 ? 'les modifications que je propose' : 'la modification que je propose'}. Rien n'est enregistré avant votre validation (« Valider et enregistrer » ou « Refuser »).`
        : llm.text;
    await this.router.noteAnswerModel(route.traceId, llm.modelId ?? null);
    return {
      reply,
      route: route.cas,
      sources,
      proposedChanges: created.map((c) => ({ id: c.id, entityType: c.entityType, entityId: c.entityId, op: c.op, patch: c.patch, summary: c.summary, status: c.status })),
      model: { id: llm.modelId, fallbackUsed: llm.fallbackUsed },
    };
  }

  /** Analyse (bouchon) de la demande : création d'action, changement de statut, report d'échéance. */
  private async propose(scope: ProjectScope, text: string, sources: Array<{ entityType: string; id: string; label: string }>) {
    const out: Array<{ entityType: string; entityId: string | null; op: 'CREATE' | 'UPDATE'; patch: any; summary: string }> = [];
    const target = sources.find((s) => JEV_WRITABLE[s.entityType]);
    const create = /(?:cr[ée]e[rz]?|ajoute[rz]?)\s+(?:une\s+)?action\s*:?\s*(.+)$/i.exec(text);
    if (create) {
      const ws = scope.access.pmo ? 'C8' : scope.access.responsable[0];
      const wsRow = ws ? await this.prisma.workstream.findFirst({ where: { projectId: scope.project.id, OR: [{ id: ws }, { code: ws }] } }) : null;
      if (wsRow && scope.access.personId) {
        out.push({ entityType: 'ACTION', entityId: null, op: 'CREATE', patch: { n: create[1].trim(), owner: scope.access.personId, wsId: wsRow.id, prio: 'MEDIUM' }, summary: `Créer l'action « ${create[1].trim()} » (chantier ${wsRow.code}, porteur : vous)` });
      }
      return out;
    }
    if (!target) return out;
    const date = /(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}(?:er)?\s+[a-zéû]+\.?(?:\s+\d{4})?)\s*$/i.exec(text);
    if (/(report|décal|échéance|date)/i.test(text) && date) {
      const d = date[1].includes('/') ? date[1].split('/').reverse().map((x) => x.padStart(2, '0')).join('-') : /^\d{4}-/.test(date[1]) ? date[1] : parseFrLabel(date[1]);
      const field = target.entityType === 'ISSUE' ? 'targetIso' : target.entityType === 'DECISION' ? 'ddIso' : 'dueIso';
      if (d) out.push({ entityType: target.entityType, entityId: target.id, op: 'UPDATE', patch: { [field]: d }, summary: `${target.label} : échéance au ${d}` });
      return out;
    }
    for (const [re, map] of STATUS_WORDS) {
      if (re.test(text) && map[target.entityType]) {
        out.push({ entityType: target.entityType, entityId: target.id, op: 'UPDATE', patch: { status: map[target.entityType] }, summary: `${target.label} : statut ${map[target.entityType]}` });
        break;
      }
    }
    return out;
  }

  private async change(scope: ProjectScope, actor: Actor, id: string) {
    const c = await this.prisma.assistantChange.findFirst({ where: { id, projectId: scope.project.id, accountId: actor.accountId } });
    if (!c) throw notFound();
    if (c.status !== 'PROPOSED') throw conflict('ALREADY_DECIDED', 'Proposition déjà validée ou refusée');
    return c;
  }

  @Post('changes/:id/confirm')
  @HttpCode(200)
  async confirm(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string) {
    const scope = await this.access.scope(actor, p);
    const c = await this.change(scope, actor, id);
    const def = JEV_WRITABLE[c.entityType];
    if (!def) throw forbidden('Jev ne modifie pas ce type de données');
    // Mêmes droits et validations qu'une saisie manuelle ; historique d'origine JEV.
    const result =
      c.op === 'CREATE'
        ? await this.tx.create(def, actor, scope, c.patch, 'JEV')
        : await this.tx.patch(def, actor, scope, c.entityId!, c.patch, undefined, 'JEV');
    await this.prisma.assistantChange.update({ where: { id }, data: { status: 'CONFIRMED', decidedAt: new Date(), entityId: (result as any).id } });
    return { id, status: 'CONFIRMED', result };
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
