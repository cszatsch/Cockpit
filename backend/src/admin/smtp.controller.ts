import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AdminOnly, Actor, CurrentActor } from '../core/auth/auth';
import { AuditService } from '../core/audit.service';
import { badRequest, businessRule } from '../core/errors';
import { parse } from '../core/http';
import { PrismaService } from '../core/prisma.service';
import { SMTP_SENDER_NAME, SmtpService } from '../core/smtp.service';
import { SmtpDraft, smtpErrors } from '../domain/smtp';
import { adminCtx } from './profiles.service';

/** Réglages du brouillon (vue « Serveur d'envoi SMTP ») ; `password` vide = conserver le mot de passe enregistré. */
const Draft = z
  .object({
    host: z.string().max(253),
    port: z.coerce.number().int(),
    enc: z.enum(['starttls', 'ssl', 'none']),
    auth: z.boolean(),
    user: z.string().max(254).default(''),
    password: z.string().max(512).optional(),
    from: z.string().max(254),
  })
  .strict();
const TestEmail = z.object({ to: z.string().trim().email('adresse e-mail attendue'), settings: Draft.optional() }).strict();

const draftOf = (i: z.infer<typeof Draft>): SmtpDraft => ({ host: i.host.trim(), port: i.port, enc: i.enc, auth: i.auth, user: i.user.trim(), from: i.from.trim() });

/**
 * Serveur d'envoi SMTP (spécification SMTP § 5 et § 6), réservé à l'Admin. Le mot de passe est chiffré au repos et
 * n'est jamais renvoyé (`hasPassword`) ; test et envoi s'exécutent uniquement côté serveur.
 */
@ApiTags('console · serveur d’envoi SMTP')
@ApiBearerAuth()
@AdminOnly()
@Controller('api/admin/settings/smtp')
export class SmtpController {
  constructor(private readonly smtp: SmtpService, private readonly audit: AuditService, private readonly prisma: PrismaService) {}

  private async view() {
    const { host, port, enc, auth, user, from, hasPassword, lastTest, lastOkAt, source } = await this.smtp.settings();
    return { host, port, enc, auth, user, from, hasPassword, lastTest, lastOkAt, source };
  }

  @Get()
  get() {
    return this.view();
  }

  @Put()
  async put(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const i = parse(Draft, body);
    const d = draftOf(i);
    const cur = await this.smtp.settings();
    const e = smtpErrors(d, i.password, cur.hasPassword);
    if (Object.keys(e).length) throw badRequest('Réglages SMTP invalides', e);
    const { before, passwordChanged } = await this.smtp.save(d, i.password, actor.fullName);
    const changed = before ? (['host', 'port', 'enc', 'auth', 'user', 'from'] as const).filter((k) => (k === 'from' ? before.fromAddress : (before as any)[k]) !== d[k]) : ['création'];
    await this.audit.action(this.prisma, adminCtx(actor), {
      action: 'Modification du serveur d’envoi SMTP',
      target: `${d.host}:${d.port} · ${d.enc}${d.auth ? ` · ${d.user}` : ' · sans authentification'}${changed.length ? ` · ${changed.join(', ')}` : ''}${passwordChanged ? ' · mot de passe remplacé' : ''}`,
      severity: 'SENSITIVE',
      entityType: 'SmtpSettings',
      entityId: 'smtp',
    });
    return this.view();
  }

  /** Test de connexion avec le brouillon en cours de saisie → `{ ok, step, code, ms, connectMs, tls }`. */
  @Post('test')
  @HttpCode(200)
  async test(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const i = parse(Draft, body);
    const d = draftOf(i);
    const r = await this.smtp.probe(d, i.password);
    await this.audit.action(this.prisma, adminCtx(actor), { action: 'Test de connexion SMTP', target: `${d.host}:${d.port} · ${r.ok ? 'réussi' : `échec (${r.step}) · ${r.code}`}`, severity: 'INFO', entityType: 'SmtpSettings', entityId: 'smtp' });
    return r;
  }

  /** E-mail de test, envoyé par le serveur (brouillon s'il est fourni, sinon réglages en vigueur) → `{ ok, ms, to }`. */
  @Post('test-email')
  @HttpCode(200)
  async testEmail(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const i = parse(TestEmail, body);
    const cur = await this.smtp.settings();
    const d = i.settings ? draftOf(i.settings) : { host: cur.host, port: cur.port, enc: cur.enc, auth: cur.auth, user: cur.user, from: cur.from };
    const pass = i.settings?.password?.trim() ? i.settings.password : await this.smtp.password();
    const t0 = Date.now();
    try {
      await this.smtp.transportFor(d, pass).sendMail({
        from: { name: SMTP_SENDER_NAME, address: d.from },
        to: i.to,
        subject: 'RISE · e-mail de test',
        text: `Cet e-mail de test confirme que le serveur ${d.host}:${d.port} envoie les e-mails de la plateforme RISE.\n\nEnvoyé depuis la Console d’administration par ${actor.fullName}.`,
      });
    } catch (e: any) {
      await this.audit.action(this.prisma, adminCtx(actor), { action: 'Envoi d’un e-mail de test', target: `${i.to} · échec`, severity: 'INFO', entityType: 'SmtpSettings', entityId: 'smtp' });
      throw businessRule(`Échec de l’envoi : ${String(e?.response ?? e?.message ?? 'erreur').slice(0, 200)}`, { to: 'non remis' });
    }
    const ms = Date.now() - t0;
    await this.audit.action(this.prisma, adminCtx(actor), { action: 'Envoi d’un e-mail de test', target: `${i.to} · remis en ${ms} ms`, severity: 'INFO', entityType: 'SmtpSettings', entityId: 'smtp' });
    return { ok: true, ms, to: i.to };
  }
}
