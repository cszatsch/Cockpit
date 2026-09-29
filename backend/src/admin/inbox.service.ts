import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Notification, Prisma } from '@prisma/client';
import { Actor } from '../core/auth/auth';
import { AuditService } from '../core/audit.service';
import { config } from '../core/config';
import { conflict, notFound } from '../core/errors';
import { JobsService } from '../core/jobs.service';
import { AI_FUNCTIONS } from '../core/llm.service';
import { MailerService } from '../core/mailer.service';
import { PrismaService } from '../core/prisma.service';
import { techErrors } from '../core/tech-errors';
import { AccountsController } from './accounts.controller';
import { DataController } from './data.controller';
import { adminCtx } from './profiles.service';
import { UsageService } from './usage.service';
import { ApiCardsService } from './api-cards.service';
import { daysLeft, expiryLevel, QUOTA_WARN_PCT } from '../domain/api-cards';
import { widgetName } from '../domain/widgets';
import { proposal, proposalText } from '../domain/habilitation-proposals';
import { ProfilesService } from './profiles.service';

/** Délai d'annulation d'une décision (spécification NOTIFICATIONS § 3) : l'action ne s'exécute qu'ensuite. */
export const DECISION_UNDO_MS = 10_000;
/** Incident d'import : seul le dernier import refusé de ces derniers jours est signalé. */
export const IMPORT_INCIDENT_DAYS = 7;

type Kind = 'ERR' | 'WARN' | 'INVITE' | 'MODULE';
interface Wanted {
  key: string;
  kind: Kind;
  title: string;
  text: string;
  note?: string | null;
  actLabel?: string | null;
  target?: string | null;
  meta?: Record<string, string>;
  level?: string | null;
}

const TYPE: Record<Kind, 'err' | 'warn' | 'invite' | 'module'> = { ERR: 'err', WARN: 'warn', INVITE: 'invite', MODULE: 'module' };

/**
 * Notifications de l'administrateur (spécification NOTIFICATIONS) : incidents, alertes et demandes.
 * Les incidents, alertes et demandes sont réconciliés avec l'état réel de la plateforme à chaque lecture
 * (`sync`) : ils apparaissent quand leur cause existe et se ferment seuls quand elle disparaît.
 * Une décision (accepter / refuser) est annulable pendant 10 s : son traitement (compte et e-mail
 * d'invitation, activation du module, message au demandeur) n'est exécuté qu'après ce délai.
 */
@Injectable()
export class InboxService implements OnModuleInit, OnModuleDestroy {
  private timers = new Set<NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    private readonly usage: UsageService,
    private readonly jobs: JobsService,
    private readonly accounts: AccountsController,
    private readonly data: DataController,
    private readonly apiCards: ApiCardsService,
    private readonly profiles: ProfilesService,
  ) {}

  onModuleInit() {
    techErrors.onError = (key, message) => void this.techError(key, message).catch(() => {});
    techErrors.onRecovered = (key) => void this.resolve(`tech:${key}`).catch(() => {});
    this.jobs.register('notifications.finalize', () => this.finalizeDue().then(() => undefined));
    this.jobs.schedule('notifications.finalize', '* * * * *');
  }

  onModuleDestroy() {
    for (const t of this.timers) clearTimeout(t);
    techErrors.onError = null;
    techErrors.onRecovered = null;
  }

  // ───────────── Lecture ─────────────

  async list() {
    await this.finalizeDue();
    await this.sync();
    const now = Date.now();
    const rows = await this.prisma.notification.findMany({
      where: { OR: [{ status: 'OPEN' }, { status: 'DECIDED', undoUntil: { gt: new Date(now) } }] },
      orderBy: { createdAt: 'desc' },
    });
    const items = rows.map((n) => this.view(n));
    const unread = items.filter((i) => i.unread);
    return { items, unreadCount: unread.length, hasError: unread.some((i) => i.type === 'err'), pendingInvitations: items.filter((i) => i.type === 'invite' && i.pending).length };
  }

  private view(n: Notification) {
    const pending = n.status === 'OPEN';
    return {
      id: n.id,
      type: TYPE[n.kind],
      title: n.title,
      text: n.text,
      note: n.note ?? undefined,
      createdAt: n.createdAt.toISOString(),
      unread: pending && !n.readAt,
      pending,
      actLabel: n.actLabel ?? undefined,
      meta: (n.meta as Record<string, string> | null) ?? undefined,
      target: n.target ?? undefined,
      decision: n.decision ?? undefined,
      undoUntil: n.undoUntil?.toISOString(),
    };
  }

  // ───────────── Réconciliation avec l'état de la plateforme ─────────────

  async sync(): Promise<void> {
    const wanted: Wanted[] = [];
    const prefixes = ['provider:', 'import:', 'snapshot:', 'budget:', 'invite:', 'module:', 'apicard:', 'access:'];

    // Clés API refusées (dernier test en échec) : incident jusqu'à un test réussi.
    const [providers, models, asg] = await Promise.all([this.prisma.provider.findMany(), this.prisma.aiModel.findMany(), this.prisma.modelAssignment.findMany()]);
    for (const p of providers.filter((x) => x.status === 'ERROR')) {
      const touched = AI_FUNCTIONS.filter((f) => {
        const a = asg.find((x) => x.functionId === f.id);
        return a && models.find((m) => m.id === a.primaryModelId)?.providerId === p.id;
      }).map((f) => f.short);
      wanted.push({
        key: `provider:${p.id}`,
        kind: 'ERR',
        title: `Clé API ${p.name} refusée`,
        text: `${p.lastError ? `${p.lastError}. ` : 'Le dernier test de la clé a échoué. '}${touched.length ? `Fonctions touchées : ${touched.join(', ')}.` : 'Aucune fonction n’utilise ce fournisseur en principal.'}`,
        actLabel: 'Remplacer la clé',
        target: 'providers',
      });
    }

    // Import refusé : tant qu'il est le dernier import du fichier d'initialisation.
    const lastImport = await this.prisma.projectImport.findFirst({ orderBy: { uploadedAt: 'desc' } });
    if (lastImport && lastImport.status === 'REJECTED' && Date.now() - lastImport.uploadedAt.getTime() < IMPORT_INCIDENT_DAYS * 86_400_000) {
      const errors = Number((lastImport.report as any)?.errors ?? 0);
      wanted.push({
        key: `import:${lastImport.id}`,
        kind: 'ERR',
        title: `Import refusé : ${lastImport.fileName}`,
        text: `${errors ? `${errors} erreur${errors > 1 ? 's' : ''} de conformité` : 'Le fichier n’est pas conforme'} · déposé par ${lastImport.uploadedBy}.`,
        actLabel: 'Voir l’import',
        target: 'init',
      });
    }

    // Snapshot en échec : tant que le dernier snapshot du projet est en échec.
    const projects = await this.prisma.project.findMany({ select: { id: true, code: true } });
    const lastSnaps = await this.prisma.snapshot.findMany({ distinct: ['projectId'], orderBy: [{ projectId: 'asc' }, { takenAt: 'desc' }] });
    for (const s of lastSnaps.filter((x) => x.status === 'FAILED')) {
      const code = projects.find((p) => p.id === s.projectId)?.code ?? s.projectId;
      wanted.push({ key: `snapshot:${s.projectId}`, kind: 'ERR', title: `Échec du snapshot ${code}`, text: `La capture du ${s.takenAt.toLocaleDateString('fr-FR')} n’a pas abouti. Relancez-la depuis Snapshots.`, actLabel: 'Voir les snapshots', target: 'snaps' });
    }

    // Seuils de coût IA atteints ou dépassés (alerte).
    const month = await this.usage.month();
    for (const t of month.thresholds.filter((x) => x.enabled && (x.status === 'ALERT' || x.status === 'EXCEEDED'))) {
      const scope = t.id === 'all' ? 'Budget IA' : `Budget IA · ${t.name}`;
      wanted.push({
        key: `budget:${t.id}`,
        kind: 'WARN',
        title: `${scope} à ${Math.round(t.pct ?? 0)} %`,
        text: `${t.spent} € consommés sur un plafond de ${t.limitEur} € ce mois-ci. Projection fin de mois : ${t.projection} €.`,
        actLabel: 'Voir les coûts',
        target: 'conso',
        level: t.status,
      });
    }

    // Accès à retirer : personne désactivée dans le référentiel dont le compte (actif ou invité) garde des droits sur le
    // projet. Incident jusqu'au retrait des droits sur ce projet ou à la suspension du compte (décision du 29/09/2026).
    const live = await this.prisma.account.findMany({ where: { status: { in: ['ACTIVE', 'INVITED'] } } });
    const ref = await this.profiles.referential(live);
    for (const a of live) {
      for (const e of (ref.get(a.id) ?? []).filter((x) => x.ecarts.accesARetirer.length)) {
        wanted.push({
          key: `access:${a.id}:${e.projectId}`,
          kind: 'ERR',
          title: `Accès à retirer : ${a.fullName}`,
          text: `Désactivé dans le référentiel ${e.code}, compte ${a.status === 'ACTIVE' ? 'actif' : 'invité'} avec ${e.ecarts.accesARetirer.join(' · ')}. Retirez ses droits sur ${e.code} ou suspendez le compte.`,
          actLabel: 'Voir les utilisateurs',
          target: 'users',
          meta: { name: a.fullName, project: e.code },
        });
      }
    }

    // Demandes d'invitation (PMO) et d'activation de module en attente.
    const invites = await this.prisma.invitationRequest.findMany({ where: { status: 'PENDING' } });
    const persons = await this.prisma.person.findMany({ where: { id: { in: invites.map((r) => r.personId) } } });
    const requesters = await this.prisma.account.findMany({ where: { id: { in: invites.map((r) => r.requestedById) } } });
    for (const r of invites) {
      const p = persons.find((x) => x.id === r.personId);
      if (!p) continue;
      const name = `${p.firstName} ${p.lastName}`.trim();
      const by = requesters.find((a) => a.id === r.requestedById)?.fullName ?? 'un PMO';
      const code = projects.find((x) => x.id === r.projectId)?.code ?? r.projectId;
      // Droits qui seront appliqués à l'acceptation : ceux que propose le référentiel.
      const owned = (await this.prisma.workstream.findMany({ where: { projectId: r.projectId, ownerId: p.id }, select: { id: true } })).map((w) => w.id);
      const droits = proposalText(proposal(owned, p.wsIds));
      wanted.push({ key: `invite:${r.id}`, kind: 'INVITE', title: `Inviter ${name}`, text: `Demandé par ${by}, PMO ${code} · ${p.email} · ${droits}.`, meta: { name, by, project: code, projectId: r.projectId } });
    }
    const modReqs = await this.prisma.moduleRequest.findMany({ where: { status: 'PENDING' } });
    const mods = await this.prisma.module.findMany({ where: { id: { in: modReqs.map((r) => r.moduleId) } } });
    for (const r of modReqs) {
      const code = projects.find((x) => x.id === r.projectId)?.code ?? r.projectId;
      const m = mods.find((x) => x.id === r.moduleId);
      wanted.push({ key: `module:${r.id}`, kind: 'MODULE', title: `Activer « ${m?.name ?? r.moduleId} »`, text: `Demandé par ${r.requestedBy}, pour le projet ${code} uniquement.`, meta: { project: code, by: r.requestedBy } });
    }

    // Cartes API actives (registre, § 6) : erreur, échéance de la clé (J-30, J-7, J-1, expirée), quota ≥ 85 %.
    for (const c of (await this.apiCards.views()).filter((x) => x.enabled)) {
      const base = { actLabel: 'Voir la carte', target: 'apis' };
      if (c.status === 'err' && c.statusNote !== 'Clé expirée') {
        wanted.push({ key: `apicard:${c.id}:err`, kind: 'ERR', title: `Carte API ${c.name} en erreur`, text: `${c.statusNote}. Les widgets ${c.widgets.map(widgetName).join(', ') || 'concernés'} passent en mode dégradé.`, ...base });
      }
      const d = daysLeft(c.keyExpiresAt, this.usage.todayIso());
      const lvl = c.keyLast4 ? expiryLevel(d) : null;
      if (lvl) {
        wanted.push({
          key: `apicard:${c.id}:exp`,
          kind: lvl === 'expired' ? 'ERR' : 'WARN',
          title: lvl === 'expired' ? `Clé ${c.name} expirée` : `Clé ${c.name} : expire dans ${d} j`,
          text: lvl === 'expired' ? `La clé ••••${c.keyLast4} a expiré le ${c.keyExpiresAt}. Remplacez-la pour rétablir le service.` : `La clé ••••${c.keyLast4} expire le ${c.keyExpiresAt} (palier J-${lvl}).`,
          level: lvl,
          ...base,
          actLabel: 'Remplacer la clé',
        });
      }
      if (c.quotaLimit && (c.quotaUsed ?? 0) / c.quotaLimit * 100 >= QUOTA_WARN_PCT) {
        wanted.push({ key: `apicard:${c.id}:quota`, kind: 'WARN', title: `Quota ${c.name} à ${Math.round(((c.quotaUsed ?? 0) / c.quotaLimit) * 100)} %`, text: `${c.quotaUsed} appels sur ${c.quotaLimit} aujourd’hui. Au-delà, les widgets reçoivent 429.`, level: (c.quotaUsed ?? 0) >= c.quotaLimit ? 'full' : 'warn', ...base });
      }
    }

    // Application : création ou réouverture, mise à jour du texte, fermeture des causes disparues.
    const existing = await this.prisma.notification.findMany({ where: { OR: prefixes.map((p) => ({ key: { startsWith: p } })) } });
    for (const w of wanted) {
      const cur = existing.find((e) => e.key === w.key);
      const data = { kind: w.kind, title: w.title, text: w.text, note: w.note ?? null, actLabel: w.actLabel ?? null, target: w.target ?? null, meta: (w.meta ?? Prisma.DbNull) as Prisma.InputJsonValue, level: w.level ?? null };
      if (!cur) await this.prisma.notification.create({ data: { key: w.key, ...data } });
      else if (cur.status === 'RESOLVED' || (cur.status === 'DONE' && w.kind !== 'INVITE' && w.kind !== 'MODULE')) await this.prisma.notification.update({ where: { id: cur.id }, data: { ...data, status: 'OPEN', readAt: null, createdAt: new Date(), resolvedAt: null, decision: null, decidedAt: null, undoUntil: null } });
      else if (cur.status === 'OPEN' && (cur.title !== w.title || cur.text !== w.text || cur.level !== data.level)) {
        // Une aggravation (ex. alerte → dépassement) la remet en « non lue ».
        await this.prisma.notification.update({ where: { id: cur.id }, data: { ...data, ...(cur.level !== data.level ? { readAt: null } : {}) } });
      }
    }
    const gone = existing.filter((e) => e.status === 'OPEN' && !wanted.some((w) => w.key === e.key));
    if (gone.length) await this.prisma.notification.updateMany({ where: { id: { in: gone.map((g) => g.id) } }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
  }

  /** Erreur technique : un incident par route, fermé à la réussite suivante de la même route. */
  private async techError(key: string, message: string) {
    const data = { kind: 'ERR' as const, title: 'Erreur technique', text: `${key} : ${message.slice(0, 300)}`, actLabel: 'Voir le journal', target: 'admins' };
    await this.prisma.notification.upsert({ where: { key: `tech:${key}` }, create: { key: `tech:${key}`, ...data }, update: { ...data, status: 'OPEN', readAt: null, resolvedAt: null } });
  }

  private async resolve(key: string) {
    await this.prisma.notification.updateMany({ where: { key, status: 'OPEN' }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
  }

  // ───────────── Lecture, décisions et annulation ─────────────

  async read(id: string) {
    await this.prisma.notification.updateMany({ where: { id, readAt: null }, data: { readAt: new Date() } });
  }

  async readAll() {
    await this.sync();
    const r = await this.prisma.notification.updateMany({ where: { status: 'OPEN', readAt: null }, data: { readAt: new Date() } });
    return { read: r.count };
  }

  /** Décision sur une demande : enregistrée tout de suite, exécutée après le délai d'annulation. */
  async decide(actor: Actor, id: string, decision: 'accept' | 'refuse') {
    const n = await this.prisma.notification.findUnique({ where: { id } });
    if (!n) throw notFound('Notification introuvable');
    if (n.kind !== 'INVITE' && n.kind !== 'MODULE') throw conflict('NOT_A_REQUEST', 'Seule une demande peut être acceptée ou refusée');
    if (n.status !== 'OPEN') throw conflict('ALREADY_DECIDED', 'Cette demande a déjà été traitée');
    const undoUntil = new Date(Date.now() + DECISION_UNDO_MS);
    await this.prisma.$transaction(async (db) => {
      await db.notification.update({ where: { id }, data: { status: 'DECIDED', decision: decision.toUpperCase(), decidedAt: new Date(), decidedById: actor.accountId, decidedBy: actor.fullName, undoUntil, readAt: n.readAt ?? new Date() } });
      await this.audit.action(db, adminCtx(actor), { action: `${n.kind === 'INVITE' ? 'Demande d’invitation' : 'Demande de module'} ${decision === 'accept' ? 'acceptée' : 'refusée'}`, target: `${n.title} · annulable 10 s`, severity: 'SENSITIVE', entityType: 'Notification', entityId: id });
    });
    if (config.jobsEnabled) {
      const t = setTimeout(() => { this.timers.delete(t); void this.finalizeDue().catch((e) => console.error('[notifications]', e)); }, DECISION_UNDO_MS + 300);
      this.timers.add(t);
    }
    return this.view((await this.prisma.notification.findUnique({ where: { id } }))!);
  }

  async undo(actor: Actor, id: string) {
    const n = await this.prisma.notification.findUnique({ where: { id } });
    if (!n) throw notFound('Notification introuvable');
    if (n.status !== 'DECIDED' || !n.undoUntil || n.undoUntil.getTime() <= Date.now()) throw conflict('UNDO_EXPIRED', 'La décision ne peut plus être annulée (10 s écoulées)');
    await this.prisma.$transaction(async (db) => {
      await db.notification.update({ where: { id }, data: { status: 'OPEN', decision: null, decidedAt: null, decidedById: null, decidedBy: null, undoUntil: null } });
      await this.audit.action(db, adminCtx(actor), { action: 'Décision annulée', target: n.title, severity: 'SENSITIVE', entityType: 'Notification', entityId: id });
    });
    return this.view((await this.prisma.notification.findUnique({ where: { id } }))!);
  }

  /**
   * Exécute les décisions dont le délai d'annulation est écoulé : même traitement que les pages Utilisateurs
   * (compte invité et e-mail d'invitation) et Modules (activation pour le projet), puis message au demandeur.
   */
  async finalizeDue(now = new Date()): Promise<number> {
    const due = await this.prisma.notification.findMany({ where: { status: 'DECIDED', undoUntil: { lte: now } } });
    let done = 0;
    for (const n of due) {
      // Réservation : une seule exécution même si plusieurs déclencheurs se croisent.
      const claimed = await this.prisma.notification.updateMany({ where: { id: n.id, status: 'DECIDED' }, data: { status: 'DONE', doneAt: new Date() } });
      if (!claimed.count) continue;
      const actor: Actor = { accountId: n.decidedById ?? 'system', sessionId: '', email: '', fullName: n.decidedBy ?? 'Administrateur', personId: null, isAdmin: true, surface: 'ADMIN', restricted: false, viaCookie: false };
      const reqId = n.key.slice(n.key.indexOf(':') + 1);
      try {
        if (n.kind === 'INVITE') {
          let mailOk = true;
          if (n.decision === 'ACCEPT') mailOk = (await this.accounts.approveInvitation(actor, reqId)).inviteSent !== false;
          else await this.accounts.rejectInvitation(actor, reqId);
          const r = await this.prisma.invitationRequest.findUnique({ where: { id: reqId } });
          await this.tellRequester(r?.requestedById, r?.projectId ?? null, `Demande d’invitation ${n.decision === 'ACCEPT' ? 'acceptée' : 'refusée'} : ${(n.meta as any)?.name ?? ''}`, n.decision === 'ACCEPT' ? (mailOk ? `${(n.meta as any)?.name} a reçu son invitation à RISE Cockpit.` : `Le compte de ${(n.meta as any)?.name} est créé ; l’e-mail d’invitation n’a pas pu partir, l’administrateur va le relancer.`) : `L’administrateur a refusé l’invitation de ${(n.meta as any)?.name}.`);
        } else {
          if (n.decision === 'ACCEPT') await this.data.approve(actor, reqId);
          else await this.data.reject(actor, reqId);
          const r = await this.prisma.moduleRequest.findUnique({ where: { id: reqId } });
          await this.tellRequester(r?.requestedById, r?.projectId ?? null, `Demande de module ${n.decision === 'ACCEPT' ? 'acceptée' : 'refusée'} : ${n.title.replace(/^Activer /, '')}`, n.decision === 'ACCEPT' ? `Le module est activé pour le projet ${(n.meta as any)?.project}.` : `L’administrateur a refusé l’activation du module pour le projet ${(n.meta as any)?.project}.`);
        }
        done++;
      } catch (e) {
        // Échec du traitement (ex. compte déjà existant) : la demande redevient à traiter.
        console.error('[notifications]', e);
        await this.prisma.notification.update({ where: { id: n.id }, data: { status: 'OPEN', decision: null, doneAt: null, undoUntil: null, text: `${n.text} · Échec du traitement : ${e instanceof Error ? e.message : String(e)}` } });
      }
    }
    return done;
  }

  /** Le demandeur est prévenu par e-mail, y compris en cas de refus. */
  /** Retour au demandeur (PMO) : notification dans le Cockpit (cloche) et e-mail. */
  private async tellRequester(accountId: string | null | undefined, projectId: string | null, subject: string, text: string) {
    const a = accountId ? await this.prisma.account.findUnique({ where: { id: accountId } }) : null;
    if (!a) return;
    await this.prisma.userNotification.create({ data: { accountId: a.id, projectId, kind: 'NOTIFICATION', title: subject, body: text } });
    // E-mail en complément : son échec n'empêche pas la notification dans le Cockpit.
    await this.mailer
      .send({ to: [a.email], subject: `RISE Cockpit · ${subject}`, text: `Bonjour ${a.fullName},\n\n${text}\n\nL’équipe RISE Cockpit` }).catch((e) => console.warn('[notifications] e-mail au demandeur non envoyé :', e instanceof Error ? e.message : e));
  }
}
