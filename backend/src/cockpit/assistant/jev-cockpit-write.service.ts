import { latencyKind } from '../../core/latency';
import { Injectable } from '@nestjs/common';
import { JevConversation, Prisma } from '@prisma/client';
import { Actor } from '../../core/auth/auth';
import { ProjectScope } from '../../core/access.service';
import { ChatTurn } from '../../core/llm-client';
import { LlmService } from '../../core/llm.service';
import { JevPromptService } from '../../core/jev-prompt.service';
import { PrismaService } from '../../core/prisma.service';
import { TodayService } from '../../core/today.service';
import { canReadLinks, canReadWs, canWriteLinks, canWriteReferential, canWriteWs, riskLinks, RISK_ALL_WS_LABEL } from '../../domain/rights';
import { requestContext } from '../../domain/jev-sql';
import { COCKPIT_CASE_ROUTE } from '../../domain/jev-router-cockpit';
import { nowParisLabel } from '../../domain/jev-cockpit-answers';
import {
  DraftOp, DraftQuestion, entityOfCode, isRefEntity, linkedActionDue, norm, normalizeWriteCode, enumValue, REF_PMO_ONLY_REPLY, unsupportedReply, unsupportedRequests, ExtractedOp, fieldSpec, frDate, matchNamed, Named, opTitle, parseDate, parseExtraction, prio4Candidates, PRIO4_LABEL,
  scaleCandidates, SCALE5_LABEL, WS_ALL_LABEL, WS_ALL_RE, WS_ALL_VALUE, WS_MULTI_SUBMIT_LABEL, WriteDraft, WriteEntity, WRITE_CANCELLED_REPLY, WRITE_CANCEL_LABEL, WRITE_CODE_RE, WRITE_ENTITY_LABEL, WRITE_EXTRACT_RULES, WRITE_FIELDS,
  WRITE_MAX_OPTIONS, WRITE_MAX_QUESTIONS, WRITE_NOTHING_REPLY, WRITE_RECAP_REPLY, WRITE_TOO_MANY_REPLY,
} from '../../domain/jev-cockpit-write';
import { jevDef } from './jev-writable';
import { UsagesService } from '../referential/usages.service';

export interface WriteChoice { label: string; answer: { value: string | number | null | string[]; toggle?: boolean } | { cancel: true } | { submit: true } }
export interface WriteProposal { id: string; entityType: string; entityId: string | null; op: string; patch: unknown; summary: string; status: string; group: 'main' | 'linked'; title: string; rows: Array<{ t: string; a?: string; b: string }>; confirmCode: string | null }
export interface WriteOutcome {
  status: 'ASK' | 'RECAP' | 'NOTHING' | 'REFUSED' | 'CANCELLED';
  reply: string;
  choices: WriteChoice[];
  proposedChanges: WriteProposal[];
  modelId: string | null;
  fallbackUsed: boolean;
}

interface Refs { people: Named[]; ws: Named[]; writable: Named[]; bodies: Named[]; phases: Array<Named & { start: string; end: string; seq: number }>; me: string | null; today: string }

/**
 * Cas 3 du Jev du Cockpit — modification des données (brief du 01/10/2026) :
 * 1. le modèle de la fonction Gestion des données (skill « Gestion des données ») extrait la demande : objet, opération,
 *    champs tels que dits (avec la conversation et la modification en cours) ;
 * 2. le serveur résout chaque valeur contre le référentiel (personnes, chantiers, instances) et les listes de valeurs
 *    (échelles, statuts, dates), contrôle les droits sur le chantier et l'objet visé ;
 * 3. valeur manquante, ambiguë ou invalide : une question à choix (une à la fois), la modification restant en cours
 *    dans la conversation ;
 * 4. tout est complet : récapitulatif tel qu'il sera écrit (propositions « À valider »), rien n'est écrit ; la
 *    confirmation (renforcée pour une suppression : code à retaper) écrit par le service métier (droits, règles,
 *    historique d'origine JEV) — `AssistantController.confirm`.
 */
@Injectable()
export class JevCockpitWriteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly jevPrompt: JevPromptService,
    private readonly today: TodayService,
    private readonly usages: UsagesService,
  ) {}

  /** Demande en langage naturel (nouvelle, ou qui complète / corrige la modification en cours). */
  async handle(scope: ProjectScope, actor: Actor, conv: JevConversation, text: string, opts: { page: string; history?: ChatTurn[] }): Promise<WriteOutcome> {
    const refs = await this.refs(scope);
    const draft = (conv.draft as unknown as WriteDraft | null) ?? null;
    const { functionId, skill } = COCKPIT_CASE_ROUTE['3'];
    const parts = await this.jevPrompt.cockpitParts(skill, opts.page);
    const cited = await this.citedRecords(scope, `${text} ${(draft?.ops ?? []).map((o) => o.code ?? '').join(' ')}`);
    const tail = [
      requestContext(parts.page, refs.today, nowParisLabel(this.today.now())),
      '## Référentiel utile',
      `Chantiers où l’utilisateur peut écrire : ${refs.writable.map((w) => w.label).join(' ; ') || 'aucun'}`,
      `Personnes du projet : ${refs.people.map((p) => p.label).join(' ; ')}`,
      `Instances de décision : ${refs.bodies.map((b) => b.label).join(' ; ')}`,
      `Phases : ${refs.phases.map((p) => p.label).join(' ; ')}`,
      ...(cited.length ? ['## Enregistrements cités (valeurs actuelles)', ...cited] : []),
      ...(draft ? ['## Modification en cours', JSON.stringify(draft.ops.map((o) => ({ objet: o.entity, operation: o.op, code: o.code ?? null, champs: o.raw, actions_liees: o.linked ?? [] })))] : []),
    ].join('\n');
    const r = await latencyKind('qry', () => this.llm.complete({ functionId, source: 'JEV', cache: true, projectId: scope.project.id, maxTokens: 1500, system: `${parts.stable}\n\n${WRITE_EXTRACT_RULES}`, systemTail: tail, prompt: text, history: opts.history }));
    const ops = parseExtraction(r.text);
    const meta = { modelId: r.modelId, fallbackUsed: r.fallbackUsed };
    if (!ops.length) {
      // Objet que Jev ne modifie pas (livrable, séance, personne…) : dire quoi faire à la place (09/10/2026).
      const un = unsupportedRequests(r.text);
      return { ...this.empty('NOTHING', un.length ? unsupportedReply(un) : WRITE_NOTHING_REPLY), ...meta };
    }
    const next: WriteDraft = { ops: ops.map((o) => this.toDraftOp(o, draft)), question: null, asked: draft?.asked ?? 0 };
    return { ...(await this.advance(scope, actor, conv, next, refs)), ...meta };
  }

  /** Réponse à la question à choix posée (ou annulation de la demande). */
  async answer(scope: ProjectScope, actor: Actor, conv: JevConversation, ans: { value?: string | number | null | string[]; cancel?: boolean }): Promise<WriteOutcome> {
    const draft = (conv.draft as unknown as WriteDraft | null) ?? null;
    if (ans.cancel || !draft || !draft.question) {
      await this.setDraft(conv.id, null);
      return this.empty('CANCELLED', ans.cancel ? WRITE_CANCELLED_REPLY : WRITE_NOTHING_REPLY);
    }
    const q = draft.question;
    const op = draft.ops[q.op];
    if (q.field === '__code') op.code = ans.value === null || ans.value === undefined ? null : String(ans.value);
    else op.raw[q.field] = { picked: ans.value ?? null };
    draft.question = null;
    return { ...(await this.advance(scope, actor, conv, draft, await this.refs(scope))), modelId: null, fallbackUsed: false };
  }

  // ───────────── Résolution ─────────────

  private toDraftOp(o: ExtractedOp, prev: WriteDraft | null): DraftOp {
    // Valeurs déjà choisies par une question (même objet, même opération) : conservées si l'extraction ne les change pas.
    const old = prev?.ops.find((p) => p.entity === o.entity && p.op === o.op && (p.code ?? null) === (o.code ?? p.code ?? null));
    const raw: Record<string, unknown> = { ...(old?.raw ?? {}) };
    for (const [k, v] of Object.entries(o.fields)) raw[o.entity === 'RISK' && k === 'wsId' ? 'wsIds' : k] = v;
    return { entity: o.entity, op: o.op, code: o.code ?? old?.code ?? null, raw, fields: {}, shown: {}, linked: o.linked.length ? o.linked : old?.linked };
  }

  /** Résout toutes les opérations ; première question à poser, refus, ou récapitulatif. */
  private async advance(scope: ProjectScope, actor: Actor, conv: JevConversation, draft: WriteDraft, refs: Refs): Promise<Omit<WriteOutcome, 'modelId' | 'fallbackUsed'>> {
    for (let i = 0; i < draft.ops.length; i++) {
      const res = await this.resolveOp(scope, draft.ops[i], i, refs);
      if (res.refuse) {
        await this.setDraft(conv.id, null);
        return this.empty('REFUSED', `${res.refuse} Rien n’a été enregistré.`);
      }
      if (res.question) {
        if (draft.asked >= WRITE_MAX_QUESTIONS) {
          await this.setDraft(conv.id, null);
          return this.empty('REFUSED', WRITE_TOO_MANY_REPLY);
        }
        draft.question = res.question;
        draft.asked++;
        await this.setDraft(conv.id, draft);
        const q = res.question;
        // Choix multiple (chantiers d'un risque) : pastilles à cocher, « Tous les chantiers », puis « Valider la sélection ».
        const choices: WriteChoice[] = q.options.slice(0, WRITE_MAX_OPTIONS).map((o) => ({ label: o.label, answer: q.multi ? { value: o.value, toggle: true } : { value: o.value } }));
        for (const x of q.extra ?? []) choices.push({ label: x.label, answer: { value: x.value } });
        if (q.multi) choices.push({ label: WS_MULTI_SUBMIT_LABEL, answer: { submit: true } });
        choices.push({ label: WRITE_CANCEL_LABEL, answer: { cancel: true } });
        return { status: 'ASK', reply: res.question.text, choices, proposedChanges: [] };
      }
    }
    // Contrôle final par le schéma de l'API métier (types, longueurs) : le serveur refera tous les contrôles à l'écriture.
    for (const o of draft.ops) {
      if (o.op === 'DELETE') continue;
      const def = jevDef(o.entity);
      const parsed = (o.op === 'CREATE' ? def.create : def.patch).safeParse(o.fields);
      if (!parsed.success) {
        await this.setDraft(conv.id, null);
        const why = parsed.error.issues.map((x) => `${fieldSpec(o.entity, String(x.path[0]))?.label ?? x.path.join('.')} : ${x.message}`).join(' ; ');
        return this.empty('REFUSED', `Je ne peux pas préparer cet enregistrement (${why}). Rien n’a été enregistré.`);
      }
    }
    const proposals = await this.propose(scope, actor, draft);
    await this.setDraft(conv.id, null);
    return { status: 'RECAP', reply: WRITE_RECAP_REPLY(draft.ops.length, draft.ops.some((o) => o.op === 'DELETE')), choices: [], proposedChanges: proposals };
  }

  private async resolveOp(scope: ProjectScope, o: DraftOp, idx: number, refs: Refs): Promise<{ question?: DraftQuestion; refuse?: string }> {
    const L = WRITE_ENTITY_LABEL[o.entity];
    o.fields = {};
    o.shown = {};
    let existing: any = null;
    if (isRefEntity(o.entity)) {
      const r = await this.resolveRef(scope, o, idx, refs);
      if (r.question || r.refuse) return r;
      existing = r.existing ?? null;
      if (o.op === 'DELETE') return {};
    } else if (o.op !== 'CREATE') {
      if (!o.code) {
        const rows = await this.writableRows(scope, o.entity, 6);
        return { question: { op: idx, field: '__code', text: `Quel ${L.one} voulez-vous ${o.op === 'DELETE' ? 'supprimer' : 'modifier'} ?`, options: rows.map((r) => ({ label: `${r.code} · ${short(r.n ?? r.t ?? r.name)}`, value: r.code })), free: true } };
      }
      // Référence du registre (R02), avec le préfixe du projet (PMS-R02) ou identifiant technique : ramenée au code.
      const delegate = (this.prisma as any)[jevDef(o.entity).delegate], cited = String(o.code).trim();
      o.code = normalizeWriteCode(cited, scope.project.code);
      if (entityOfCode(o.code) !== o.entity) {
        const byId = await delegate.findFirst({ where: { projectId: scope.project.id, id: cited } });
        if (!byId) return { refuse: `Le code ${cited} ne correspond pas à ${L.a}.` };
        o.code = byId.code;
      }
      existing = await delegate.findFirst({ where: { projectId: scope.project.id, code: o.code } });
      const xl = o.entity === 'RISK' ? riskLinks(existing ?? {}) : { ids: existing?.wsId ? [existing.wsId] : [], all: false };
      if (!existing || !canReadLinks(scope.access, xl)) return { refuse: `Je ne trouve pas ${L.the} ${o.code} dans votre périmètre.` };
      if (!canWriteLinks(scope.access, xl)) return { refuse: `Vous ne pouvez pas ${o.op === 'DELETE' ? 'supprimer' : 'modifier'} ${o.code} : seul le PMO ou le Responsable du chantier ${existing.wsId} le peut.` };
      if (o.entity === 'DECISION' && existing.status === 'ARBITRATED') return { refuse: `La décision ${o.code} est arbitrée : sa fiche est en lecture seule.` };
      o.targetId = existing.id;
      o.targetLabel = `${existing.code} · ${existing.n ?? existing.t}`;
      if (o.op === 'DELETE') return {};
    }
    const specs = WRITE_FIELDS[o.entity];
    const keys = o.op === 'CREATE' ? specs.map((s) => s.key) : specs.map((s) => s.key).filter((k) => o.raw[k] !== undefined);
    if (o.op === 'UPDATE' && !keys.length) return { question: { op: idx, field: 'n', text: `Que voulez-vous modifier dans ${o.code} ? Écrivez le champ et la nouvelle valeur (par exemple « échéance au 15/11 »).`, options: [], free: true } };
    for (const key of keys) {
      const spec = fieldSpec(o.entity, key)!;
      const raw = o.raw[key];
      const picked = raw && typeof raw === 'object' && 'picked' in (raw as any) ? (raw as any).picked : undefined;
      const has = picked !== undefined || (raw !== undefined && raw !== null && raw !== '');
      const ask = (text: string, options: DraftQuestion['options'], free = false): { question: DraftQuestion } => ({ question: { op: idx, field: key, text, options, free } });
      const need = spec.required && o.op === 'CREATE';
      switch (spec.kind) {
        case 'text': {
          const v = picked ?? raw;
          if (!has) { if (need) return ask(`Quel est le ${spec.label.toLowerCase()} ${o.op === 'CREATE' ? `du nouvel enregistrement (${L.one})` : ''} ? Écrivez-le dans le champ de Jev.`, [], true); break; }
          o.fields[key] = String(v).trim();
          o.shown[key] = short(String(v).trim(), 400);
          break;
        }
        case 'scale5':
        case 'prio4': {
          const max = spec.kind === 'scale5' ? 5 : 4, lab = spec.kind === 'scale5' ? SCALE5_LABEL : PRIO4_LABEL;
          const c = picked !== undefined ? [Number(picked)] : spec.kind === 'scale5' ? scaleCandidates(raw, 5) : prio4Candidates(raw);
          const all = Array.from({ length: max }, (_, k) => (spec.kind === 'scale5' ? k + 1 : max - k));
          if (c.length === 1) { o.fields[key] = c[0]; o.shown[key] = `${c[0]} (${lab[c[0]]})`; break; }
          if (!has && !need) break;
          const opts = (c.length > 1 ? c : all).map((v) => ({ label: `${v} · ${lab[v]}`, value: v }));
          return ask(c.length > 1
            ? `${spec.label} « ${String(raw)} » : ${c.map((v) => `${v} (${lab[v]})`).join(' ou ')} ?`
            : has ? `${spec.label} « ${String(raw)} » n’est pas une valeur reconnue. Choisissez :` : `Quel${spec.label.endsWith('é') ? 'le' : ''} ${spec.label.toLowerCase()} ? (${spec.kind === 'scale5' ? '1 très faible à 5 très élevé' : '4 critique à 1 basse'})`, opts);
        }
        case 'enum': {
          const v = picked !== undefined ? String(picked) : enumValue(raw, spec.values!);
          if (v && spec.values![v]) { o.fields[key] = v; o.shown[key] = spec.values![v]; break; }
          if (!has) break;
          return ask(`${spec.label} « ${String(raw)} » n’est pas une valeur reconnue. Choisissez :`, Object.entries(spec.values!).map(([k, l]) => ({ label: l, value: k })));
        }
        case 'date': {
          if (picked === null) { o.fields[key] = null; o.shown[key] = 'aucune'; break; }
          const v = picked !== undefined ? String(picked) : parseDate(raw, refs.today);
          if (v) { o.fields[key] = v; o.shown[key] = frDate(v); break; }
          if (!has) break;
          return ask(`${spec.label} « ${String(raw)} » : quelle date exactement ? Écrivez-la au format JJ/MM/AAAA dans le champ de Jev.`, [{ label: `Sans ${spec.label.toLowerCase()}`, value: null }], true);
        }
        case 'person': {
          const me = refs.people.find((p) => p.id === refs.me);
          const m = picked !== undefined ? refs.people.filter((p) => p.id === picked) : norm1(raw) === 'moi' && me ? [me] : matchNamed(raw, refs.people);
          if (m.length === 1) { o.fields[key] = m[0].id; o.shown[key] = m[0].label; break; }
          if (!has && !need) break;
          const ws = (o.fields.wsId as string | undefined) ?? (o.fields.wsIds as string[] | undefined)?.[0] ?? existing?.wsId ?? undefined;
          const near = m.length > 1 ? m : await this.peopleNear(scope, refs, ws);
          return ask(m.length > 1 ? `Plusieurs personnes correspondent à « ${String(raw)} » : laquelle ?` : has ? `Je ne trouve pas « ${String(raw)} » parmi les personnes du projet. Qui est le ${spec.label.toLowerCase()} ?` : `Qui est le ${spec.label.toLowerCase()} ?`, near.map((p) => ({ label: p.label, value: p.id })), true);
        }
        case 'ws': {
          // Jalon sans chantier (« transverse », « aucun ») : chantier vide (09/10/2026).
          if (o.entity === 'MILESTONE' && (picked === null || (picked === undefined && /^\s*(transverse|aucun|sans|tous|toutes)\b/i.test(String(raw ?? ''))))) { o.fields[key] = null; o.shown[key] = 'Transverse (aucun chantier)'; break; }
          const m = picked !== undefined ? refs.ws.filter((w) => w.id === picked) : matchNamed(raw, refs.ws);
          if (m.length === 1 && canWriteWs(scope.access, m[0].id)) { o.fields[key] = m[0].id; o.shown[key] = m[0].label; break; }
          if (!has && !need) break;
          if (!has && refs.writable.length === 1) { o.fields[key] = refs.writable[0].id; o.shown[key] = refs.writable[0].label; break; }
          if (!refs.writable.length) return { refuse: 'Vous n’avez le droit d’écrire sur aucun chantier de ce projet.' };
          const opts = (m.length > 1 ? m.filter((w) => canWriteWs(scope.access, w.id)) : refs.writable).map((w) => ({ label: w.label, value: w.id }));
          return ask(m.length === 1 ? `Vous ne pouvez écrire que sur vos chantiers : ${m[0].label} n’en fait pas partie. Lequel choisir ?` : m.length > 1 ? `Plusieurs chantiers correspondent à « ${String(raw)} » : lequel ?` : has ? `Je ne trouve pas le chantier « ${String(raw)} ». Lequel ?` : 'Sur quel chantier ?', opts.length ? opts : refs.writable.map((w) => ({ label: w.label, value: w.id })));
        }
        case 'wsMulti': {
          // Chantiers d'un risque (08/10/2026) : un ou plusieurs, ou tous (transverse, PMO seulement).
          const all = picked === WS_ALL_VALUE || (picked === undefined && typeof raw === 'string' && WS_ALL_RE.test(raw)) || (Array.isArray(raw) && raw.some((x) => WS_ALL_RE.test(String(x))));
          const isPmo = canWriteLinks(scope.access, { ids: [], all: true });
          if (all) {
            if (!isPmo) return ask('Un risque transverse (tous les chantiers) est réservé au PMO. Sur quels chantiers, parmi les vôtres ?', refs.writable.map((w) => ({ label: w.label, value: w.id })));
            o.fields.allWs = true; o.fields.wsIds = []; o.shown[key] = RISK_ALL_WS_LABEL; break;
          }
          const tokens: unknown[] = picked !== undefined ? (Array.isArray(picked) ? picked : picked === null ? [] : [picked]) : Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/\s*(?:,|;|\bet\b|\+)\s*/i).filter(Boolean) : raw ? [raw] : [];
          const found = tokens.map((t) => (picked !== undefined ? refs.ws.filter((w) => w.id === t) : matchNamed(t, refs.ws)));
          const ok = found.length > 0 && found.every((f) => f.length === 1);
          const ids = ok ? [...new Set(found.map((f) => f[0].id))] : [];
          if (ok && canWriteLinks(scope.access, { ids, all: false })) {
            o.fields.wsIds = ids; o.fields.allWs = false;
            o.shown[key] = ids.map((x) => refs.ws.find((w) => w.id === x)!.label).join(', ');
            break;
          }
          if (!has && !need) break;
          if (!has && refs.writable.length === 1 && !isPmo) { o.fields.wsIds = [refs.writable[0].id]; o.fields.allWs = false; o.shown[key] = refs.writable[0].label; break; }
          if (!refs.writable.length) return { refuse: 'Vous n’avez le droit d’écrire sur aucun chantier de ce projet.' };
          const bad = ok ? ids.filter((x) => !canWriteLinks(scope.access, { ids: [x], all: false })).map((x) => refs.ws.find((w) => w.id === x)!.label) : [];
          const text = bad.length ? `Vous ne pouvez écrire que sur vos chantiers : ${bad.join(', ')} n’en ${bad.length > 1 ? 'font' : 'fait'} pas partie. Quels chantiers choisir ?`
            : has ? `Je ne reconnais pas tous les chantiers de « ${Array.isArray(raw) ? raw.join(', ') : String(raw)} ». Quels chantiers sont concernés ?` : 'Quels chantiers sont concernés ? Cochez-en un ou plusieurs' + (isPmo ? ', ou choisissez « Tous les chantiers ».' : '.');
          return { question: { op: idx, field: key, text, options: refs.writable.map((w) => ({ label: w.label, value: w.id })), free: true, multi: true, extra: isPmo ? [{ label: WS_ALL_LABEL, value: WS_ALL_VALUE }] : [] } };
        }
        case 'phase': {
          // Phase (Référentiel) : par numéro ou nom ; jalon sans phase citée : celle dont la période contient sa date.
          let m = picked !== undefined ? refs.phases.filter((x) => x.id === picked) : has ? matchNamed(raw, refs.phases) as typeof refs.phases : [];
          if (!has && o.entity === 'MILESTONE' && o.fields.iso) m = refs.phases.filter((x) => x.start <= String(o.fields.iso) && String(o.fields.iso) <= x.end).slice(0, 1);
          if (m.length === 1) { o.fields[key] = m[0].id; o.shown[key] = m[0].label; break; }
          if (!has && !need) break;
          return ask(m.length > 1 ? `Plusieurs phases correspondent à « ${String(raw)} » : laquelle ?` : has ? `Je ne trouve pas la phase « ${String(raw)} ». Laquelle ?` : 'Dans quelle phase ?', (m.length > 1 ? m : refs.phases).map((x) => ({ label: x.label, value: x.id })));
        }
        case 'phaseMulti': {
          const tokens: unknown[] = picked !== undefined ? (Array.isArray(picked) ? picked : picked === null ? [] : [picked]) : Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/\s*(?:,|;|\bet\b|\+)\s*/i).filter(Boolean) : raw ? [raw] : [];
          if (!tokens.length) break;
          const found = tokens.map((t) => (picked !== undefined ? refs.phases.filter((x) => x.id === t) : matchNamed(t, refs.phases)));
          if (found.every((f) => f.length === 1)) { const ids = [...new Set(found.map((f) => f[0].id))]; o.fields[key] = ids; o.shown[key] = ids.map((x) => refs.phases.find((p) => p.id === x)!.label).join(', '); break; }
          return { question: { op: idx, field: key, text: `Je ne reconnais pas toutes les phases de « ${Array.isArray(raw) ? raw.join(', ') : String(raw)} ». Lesquelles ?`, options: refs.phases.map((x) => ({ label: x.label, value: x.id })), free: true, multi: true, extra: [] } };
        }
        case 'body': {
          const m = picked !== undefined ? refs.bodies.filter((b) => b.id === picked) : matchNamed(raw, refs.bodies);
          if (m.length === 1) { o.fields[key] = m[0].id; o.shown[key] = m[0].label; break; }
          if (!has && !need) break;
          return ask(has ? `Je ne trouve pas l’instance « ${String(raw)} ». Laquelle ?` : 'Quelle instance doit trancher ?', (m.length > 1 ? m : refs.bodies).map((b) => ({ label: b.label, value: b.id })));
        }
        case 'source': {
          const code = String(picked ?? raw).toUpperCase().match(/(R\d{2,}|P\d{2,}|D-\d{3,}|J\d{2,})/)?.[1];
          if (!code) break;
          const type = /^R/.test(code) ? 'RISK' : /^P/.test(code) ? 'ISSUE' : /^D-/.test(code) ? 'DECISION' : 'MILESTONE';
          const delegate = { RISK: 'risk', ISSUE: 'issue', DECISION: 'decision', MILESTONE: 'milestone' }[type];
          const row = await (this.prisma as any)[delegate].findFirst({ where: { projectId: scope.project.id, code } });
          if (!row) return ask(`Je ne trouve pas l’objet d’origine ${code}. Créer l’action sans origine ?`, [{ label: 'Sans origine', value: null }]);
          o.fields.sourceType = type;
          o.fields.sourceId = row.id;
          o.shown[key] = code;
          break;
        }
      }
    }
    if (o.entity === 'SUBPHASE' && o.op === 'CREATE' && o.fields.phaseId) o.fields.code = await this.subphaseCode(scope, String(o.fields.phaseId), refs);
    return {};
  }

  /**
   * Objet du Référentiel (09/10/2026) : PMO seulement ; objet visé retrouvé par son code ou son nom (« 5 », « P5 »,
   * « 5. Ancrer le changement ») ; suppression : refusée d'emblée si l'objet est utilisé (mêmes contrôles que le
   * Référentiel) ; création : numéro de phase et code de sous-phase calculés.
   */
  private async resolveRef(scope: ProjectScope, o: DraftOp, idx: number, refs: Refs): Promise<{ question?: DraftQuestion; refuse?: string; existing?: any }> {
    const L = WRITE_ENTITY_LABEL[o.entity], P = scope.project.id, delegate = (this.prisma as any)[jevDef(o.entity).delegate];
    if (!canWriteReferential(scope.access)) return { refuse: REF_PMO_ONLY_REPLY };
    const nameOf = (r: any) => r.name ?? r.n;
    if (o.op === 'CREATE') {
      if (o.entity === 'PHASE') o.fields.seq = Math.max(0, ...refs.phases.map((x) => x.seq)) + 1;
      return {};
    }
    const verb = o.op === 'DELETE' ? 'supprimer' : 'modifier';
    const rows: any[] = await delegate.findMany({ where: { projectId: P }, orderBy: { code: 'asc' } });
    if (!o.code) return { question: { op: idx, field: '__code', text: `Quel${o.entity === 'WORKSTREAM' || o.entity === 'MILESTONE' ? '' : 'le'} ${L.one} voulez-vous ${verb} ?`, options: rows.slice(0, 8).map((r) => ({ label: `${r.code} · ${short(nameOf(r))}`, value: r.id })), free: true } };
    const ref = norm(o.code), bare = ref.replace(/^(phase|sous-phase|sous phase|chantier|jalon|p|c|j)\s*/, '');
    let m = rows.filter((r) => r.id === o.code || norm(r.code) === ref || norm(r.code) === bare || norm(nameOf(r)) === ref || norm(`${r.code}. ${nameOf(r)}`) === ref || norm(`${r.code} ${nameOf(r)}`) === ref);
    if (!m.length) m = rows.filter((r) => { const n = norm(nameOf(r)); return n.length > 2 && (n.includes(bare) || bare.includes(n)); });
    if (m.length > 1) return { question: { op: idx, field: '__code', text: `Plusieurs ${L.one}s correspondent à « ${o.code} » : laquelle ?`.replace('laquelle', o.entity === 'WORKSTREAM' || o.entity === 'MILESTONE' ? 'lequel' : 'laquelle'), options: m.slice(0, 8).map((r) => ({ label: `${r.code} · ${short(nameOf(r))}`, value: r.id })), free: true } };
    if (!m.length) return { refuse: `Je ne trouve pas ${L.the} « ${o.code} » dans ce projet.` };
    const row = m[0];
    o.code = row.code;
    o.targetId = row.id;
    o.targetLabel = `${row.code} · ${nameOf(row)}`;
    if (o.op === 'DELETE') {
      const used = await this.usages.usages(this.prisma as any, P, o.entity, row.id);
      if (used.length) {
        const list = used.slice(0, 5).map((u) => u.label).join(' ; ');
        return { refuse: `${L.the.charAt(0).toUpperCase() + L.the.slice(1)} ${o.targetLabel} est utilisé${o.entity === 'PHASE' || o.entity === 'SUBPHASE' ? 'e' : ''} par ${used.length} élément${used.length > 1 ? 's' : ''} (${list}${used.length > 5 ? ' …' : ''}) : supprimez-les ou rattachez-les ailleurs d’abord.` };
      }
    }
    return { existing: row };
  }

  /** Code d'une nouvelle sous-phase : numéro de sa phase, puis rang suivant (« 2.4 »). */
  private async subphaseCode(scope: ProjectScope, phaseId: string, refs: Refs): Promise<string> {
    const ph = refs.phases.find((x) => x.id === phaseId);
    const subs = await this.prisma.subphase.findMany({ where: { projectId: scope.project.id, phaseId }, select: { code: true } });
    const rank = Math.max(0, ...subs.map((x) => parseInt(String(x.code).split('.')[1], 10) || 0)) + 1;
    return `${ph?.seq ?? ''}.${rank}`;
  }

  // ───────────── Propositions ─────────────

  private async propose(scope: ProjectScope, actor: Actor, draft: WriteDraft): Promise<WriteProposal[]> {
    const out: WriteProposal[] = [];
    const refs = await this.refs(scope);
    for (const o of draft.ops) {
      const before = o.op === 'UPDATE' ? await this.currentShown(scope, o, refs) : {};
      const rows = o.op === 'DELETE'
        ? [{ t: o.targetLabel ?? o.code ?? '', b: 'supprimé définitivement' }]
        : WRITE_FIELDS[o.entity].filter((f) => o.shown[f.key] !== undefined).map((f) => (o.op === 'UPDATE' ? { t: f.label, a: before[f.key] ?? '—', b: o.shown[f.key] } : { t: f.label, b: o.shown[f.key] }));
      const title = opTitle(o);
      const summary = `${title}${o.targetLabel && o.op !== 'DELETE' ? ` (${o.targetLabel})` : ''} — ${rows.map((r) => `${r.t} : ${r.a ? `${r.a} → ` : ''}${r.b}`).join(' ; ')}`.slice(0, 2000);
      const c = await this.prisma.assistantChange.create({
        data: { projectId: scope.project.id, accountId: actor.accountId, entityType: o.entity, entityId: o.targetId ?? null, op: o.op, patch: o.fields as any, summary },
      });
      out.push({ id: c.id, entityType: c.entityType, entityId: c.entityId, op: c.op, patch: c.patch, summary, status: c.status, group: 'main', title, rows, confirmCode: o.op === 'DELETE' ? o.code ?? null : null });
      // Actions de mitigation d'un nouveau risque : actions liées, validées à part (après le risque).
      if (o.entity === 'RISK' && o.op === 'CREATE' && o.linked?.length) {
        for (const a of o.linked) {
          const owner = a.owner ? matchNamed(a.owner, refs.people) : [];
          // Sans échéance propre : celle du plan de mitigation du nouveau risque (copie unique, `linkedActionDue`).
          const own = a.dueIso ? parseDate(a.dueIso, refs.today) : null, due = linkedActionDue(own, o.fields.dueIso as string | undefined);
          // Action liée : un seul chantier, le premier du risque (risque transverse : le premier chantier où l'utilisateur peut écrire).
          const aWs = (o.fields.wsIds as string[] | undefined)?.[0] ?? (o.fields.wsId as string | undefined) ?? refs.writable[0]?.id;
          const patch = { n: a.n, wsId: aWs, owner: owner.length === 1 ? owner[0].id : o.fields.owner, ...(due ? { dueIso: due } : {}), sourceType: 'RISK', sourceRef: c.id };
          const who = refs.people.find((p) => p.id === patch.owner)?.label ?? '';
          const lrows = [{ t: 'Libellé', b: a.n }, { t: 'Porteur', b: who }, { t: 'Chantier', b: refs.ws.find((w) => w.id === aWs)?.label ?? '' }, ...(due ? [{ t: 'Échéance', b: frDate(due) + (own ? '' : ' (reprise du risque)') }] : []), { t: 'Origine', b: 'le nouveau risque' }];
          const lc = await this.prisma.assistantChange.create({ data: { projectId: scope.project.id, accountId: actor.accountId, entityType: 'ACTION', entityId: null, op: 'CREATE', patch: patch as any, summary: `Créer une action liée — ${a.n}`.slice(0, 2000) } });
          out.push({ id: lc.id, entityType: 'ACTION', entityId: null, op: 'CREATE', patch, summary: lc.summary, status: lc.status, group: 'linked', title: `Action liée · ${short(a.n, 80)}`, rows: lrows, confirmCode: null });
        }
      }
    }
    return out;
  }

  /** Valeurs actuelles lisibles d'un objet (colonne « avant » d'une modification). */
  private async currentShown(scope: ProjectScope, o: DraftOp, refs: Refs): Promise<Record<string, string>> {
    const row: any = await (this.prisma as any)[jevDef(o.entity).delegate].findFirst({ where: { id: o.targetId } });
    if (!row) return {};
    const out: Record<string, string> = {};
    for (const f of WRITE_FIELDS[o.entity]) {
      if (f.kind === 'phaseMulti') continue;
      const v = f.kind === 'person' ? row[f.key === 'owner' ? 'ownerId' : f.key === 'maker' ? 'makerId' : f.key] : row[f.key];
      if (v === null || v === undefined || v === '') continue;
      out[f.key] = f.kind === 'person' ? refs.people.find((p) => p.id === v)?.label ?? String(v)
        : f.kind === 'ws' ? refs.ws.find((w) => w.id === v)?.label ?? String(v)
        : f.kind === 'body' ? refs.bodies.find((b) => b.id === v)?.label ?? String(v)
        : f.kind === 'phase' ? refs.phases.find((x) => x.id === v)?.label ?? String(v)
        : f.kind === 'scale5' ? `${v} (${SCALE5_LABEL[v]})` : f.kind === 'prio4' ? `${v} (${PRIO4_LABEL[v]})`
        : f.kind === 'enum' ? f.values![v] ?? String(v) : f.kind === 'date' ? frDate(String(v)) : short(String(v), 200);
    }
    return out;
  }

  // ───────────── Référentiel ─────────────

  private async refs(scope: ProjectScope): Promise<Refs> {
    const P = scope.project.id;
    const [people, ws, bodies, phases] = await Promise.all([
      this.prisma.person.findMany({ where: { projectId: P, active: true }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] }),
      this.prisma.workstream.findMany({ where: { projectId: P }, orderBy: { seq: 'asc' } }),
      this.prisma.governanceBody.findMany({ where: { projectId: P } }),
      this.prisma.phase.findMany({ where: { projectId: P }, orderBy: { seq: 'asc' } }),
    ]);
    const wsN = ws.map((w) => ({ id: w.id, label: `${w.code} · ${w.name}`, keys: [w.code, w.name, `${w.code} ${w.name}`] }));
    return {
      people: people.map((p) => ({ id: p.id, label: `${p.firstName} ${p.lastName}`.trim(), keys: [`${p.firstName} ${p.lastName}`, p.lastName, p.firstName, p.email] })),
      ws: wsN,
      writable: wsN.filter((w) => canWriteWs(scope.access, w.id)),
      bodies: bodies.map((b) => ({ id: b.id, label: `${b.shortName} · ${b.name}`, keys: [b.shortName, b.name] })),
      phases: phases.map((x) => ({ id: x.id, label: `${x.code} · ${x.name}`, keys: [x.code, String(x.seq), x.name, `P${x.seq}`, `phase ${x.seq}`], start: x.startDate, end: x.endDate, seq: x.seq })),
      me: scope.access.personId,
      today: this.today.today(),
    };
  }

  /** Personnes proposées pour un porteur : responsable et membres du chantier, puis l'utilisateur. */
  private async peopleNear(scope: ProjectScope, refs: Refs, wsId: string | undefined): Promise<Named[]> {
    const out: Named[] = [];
    if (wsId) {
      const w = await this.prisma.workstream.findFirst({ where: { id: wsId, projectId: scope.project.id } });
      const members = await this.prisma.person.findMany({ where: { projectId: scope.project.id, active: true, OR: [{ id: w?.ownerId ?? '' }, { wsIds: { has: wsId } }] } });
      for (const m of members.sort((a, b) => (a.id === w?.ownerId ? -1 : b.id === w?.ownerId ? 1 : 0))) {
        const n = refs.people.find((p) => p.id === m.id);
        if (n && !out.includes(n)) out.push(n);
      }
    }
    const me = refs.people.find((p) => p.id === refs.me);
    if (me && !out.includes(me)) out.push(me);
    return out.slice(0, WRITE_MAX_OPTIONS);
  }

  /** Objets que l'utilisateur peut modifier (choix proposés quand le code manque), les plus récents d'abord. */
  private async writableRows(scope: ProjectScope, entity: WriteEntity, n: number): Promise<any[]> {
    const rows = await (this.prisma as any)[jevDef(entity).delegate].findMany({ where: { projectId: scope.project.id }, orderBy: { code: 'desc' } });
    if (isRefEntity(entity)) return rows.slice(0, n);
    return rows.filter((r: any) => canWriteLinks(scope.access, entity === 'RISK' ? riskLinks(r) : { ids: r.wsId ? [r.wsId] : [], all: false }) && !(entity === 'DECISION' && r.status === 'ARBITRATED')).slice(0, n);
  }

  /** Valeurs actuelles des objets cités (codes du texte ou de la modification en cours), dans le périmètre de lecture. */
  private async citedRecords(scope: ProjectScope, text: string): Promise<string[]> {
    const codes = [...new Set((text.match(WRITE_CODE_RE) ?? []).map((c) => c.toUpperCase()))].slice(0, 6);
    const out: string[] = [];
    for (const code of codes) {
      const e = entityOfCode(code);
      if (!e) continue;
      const r: any = await (this.prisma as any)[jevDef(e).delegate].findFirst({ where: { projectId: scope.project.id, code } });
      if (!r || !canReadLinks(scope.access, e === 'RISK' ? riskLinks(r) : { ids: r.wsId ? [r.wsId] : [], all: false })) continue;
      const pick = Object.fromEntries(Object.entries(r).filter(([k]) => !['projectId', 'createdAt', 'updatedAt', 'version', 'order'].includes(k)));
      out.push(`- ${code} : ${JSON.stringify(pick)}`);
    }
    return out;
  }

  private setDraft(id: string, draft: WriteDraft | null) {
    return this.prisma.jevConversation.update({ where: { id }, data: { draft: draft === null ? Prisma.DbNull : (draft as unknown as Prisma.InputJsonValue) } });
  }

  private empty(status: WriteOutcome['status'], reply: string): WriteOutcome {
    return { status, reply, choices: [], proposedChanges: [], modelId: null, fallbackUsed: false };
  }
}

const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const norm1 = (v: unknown) => String(v ?? '').trim().toLowerCase();
