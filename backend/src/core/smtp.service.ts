import { Injectable } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import { Prisma, SmtpSettings } from '@prisma/client';
import { decryptSecret, encryptSecret } from './crypto';
import { PrismaService } from './prisma.service';
import { SMTP_CONNECT_TIMEOUT_MS, SMTP_REPLY_TIMEOUT_MS, SmtpDraft, SmtpEnc, smtpFromEnv } from '../domain/smtp';
import { smtpProbe, SmtpProbeResult } from './smtp-probe';

export interface SmtpLastTest extends SmtpProbeResult {
  at: string;
}

/** Nom affiché de l'expéditeur des e-mails de la plateforme. */
export const SMTP_SENDER_NAME = 'RISE Cockpit';
const ID = 'smtp';

/**
 * Serveur d'envoi SMTP (spécification SMTP) : réglages enregistrés dans la Console (table `smtp_settings`), sinon
 * variables d'environnement (SMTP_HOST, SMTP_PORT, SMTP_ENC, SMTP_USER, SMTP_PASSWORD, SMTP_FROM ou SMTP_URL).
 * Le mot de passe est chiffré au repos et ne quitte jamais le serveur. Tous les e-mails passent par `transport()`.
 */
@Injectable()
export class SmtpService {
  private cached: { key: string; t: Transporter } | null = null;
  /** Dernier test des réglages d'environnement (rien n'est encore enregistré) : conservé en mémoire. */
  private envTest: { test: SmtpLastTest; okAt: Date | null } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  row() {
    return this.prisma.smtpSettings.findUnique({ where: { id: ID } });
  }

  draftOf(r: SmtpSettings): SmtpDraft {
    return { host: r.host, port: r.port, enc: r.enc as SmtpEnc, auth: r.auth, user: r.user, from: r.fromAddress };
  }

  /** Réglages en vigueur (jamais le mot de passe). */
  async settings() {
    const r = await this.row();
    if (r) return { ...this.draftOf(r), hasPassword: !!r.passwordEncrypted || !!process.env.SMTP_PASSWORD, lastTest: (r.lastTest as SmtpLastTest | null) ?? null, lastOkAt: r.lastOkAt?.toISOString() ?? null, source: 'console' as const };
    const env = smtpFromEnv(process.env);
    return { ...env, hasPassword: !!this.envPassword(), lastTest: this.envTest?.test ?? null, lastOkAt: this.envTest?.okAt?.toISOString() ?? null, source: 'environnement' as const };
  }

  private envPassword(): string | null {
    if (process.env.SMTP_PASSWORD) return process.env.SMTP_PASSWORD;
    try {
      return process.env.SMTP_URL ? decodeURIComponent(new URL(process.env.SMTP_URL).password) || null : null;
    } catch {
      return null;
    }
  }

  /** Mot de passe en vigueur (déchiffré, usage interne seulement). */
  async password(): Promise<string | null> {
    const r = await this.row();
    if (r?.passwordEncrypted) return decryptSecret(r.passwordEncrypted);
    return this.envPassword();
  }

  /** Un serveur est configuré : réglages enregistrés, ou SMTP_HOST / SMTP_URL. */
  async configured(): Promise<boolean> {
    return !!(await this.row()) || !!process.env.SMTP_HOST || !!process.env.SMTP_URL;
  }

  /** Enregistrement ; `password` vide ou absent : le mot de passe existant est conservé. */
  async save(d: SmtpDraft, password: string | undefined, by: string) {
    const before = await this.row();
    const pass = password?.trim() ? encryptSecret(password) : undefined;
    const data = { host: d.host.trim(), port: d.port, enc: d.enc, auth: d.auth, user: d.user.trim(), fromAddress: d.from.trim(), updatedBy: by };
    // Toute modification invalide le dernier test (§ 3) ; un enregistrement à l'identique le conserve.
    const same = before && JSON.stringify(this.draftOf(before)) === JSON.stringify({ ...d, host: data.host, user: data.user, from: data.fromAddress }) && !pass;
    const row = await this.prisma.smtpSettings.upsert({
      where: { id: ID },
      create: { id: ID, ...data, passwordEncrypted: pass ?? (this.envPassword() ? encryptSecret(this.envPassword()!) : null) },
      update: { ...data, ...(pass ? { passwordEncrypted: pass } : {}), ...(same ? {} : { lastTest: Prisma.DbNull, lastOkAt: null }), version: { increment: 1 } },
    });
    this.cached = null;
    return { before, row, passwordChanged: !!pass };
  }

  /** Test du brouillon (mot de passe saisi, sinon celui en vigueur) ; mémorisé s'il porte sur les réglages en vigueur. */
  async probe(d: SmtpDraft, password: string | undefined): Promise<SmtpProbeResult> {
    const res = await smtpProbe(d, password?.trim() ? password : await this.password());
    const cur = await this.settings();
    const { hasPassword: _h, lastTest: _l, lastOkAt: _o, source: _s, ...saved } = cur;
    if (!password?.trim() && JSON.stringify(saved) === JSON.stringify(d)) {
      const test: SmtpLastTest = { ...res, at: new Date().toISOString() };
      if (cur.source === 'console') await this.prisma.smtpSettings.update({ where: { id: ID }, data: { lastTest: test as any, ...(res.ok ? { lastOkAt: new Date() } : {}) } });
      else this.envTest = { test, okAt: res.ok ? new Date() : this.envTest?.okAt ?? null };
    }
    return res;
  }

  /** Transport Nodemailer d'un jeu de réglages. */
  transportFor(d: SmtpDraft, password: string | null): Transporter {
    return nodemailer.createTransport({
      host: d.host,
      port: d.port,
      secure: d.enc === 'ssl',
      requireTLS: d.enc === 'starttls',
      ignoreTLS: d.enc === 'none',
      auth: d.auth ? { user: d.user, pass: password ?? '' } : undefined,
      connectionTimeout: SMTP_CONNECT_TIMEOUT_MS,
      greetingTimeout: SMTP_REPLY_TIMEOUT_MS,
      socketTimeout: 30_000,
    });
  }

  /** Transport en vigueur, ou null si aucun serveur n'est configuré. */
  async transport(): Promise<{ t: Transporter; from: string } | null> {
    if (!(await this.configured())) return null;
    const s = await this.settings();
    const pass = await this.password();
    const key = JSON.stringify([s.host, s.port, s.enc, s.auth, s.user, s.from, pass ? pass.length : 0, (await this.row())?.version ?? 0]);
    if (this.cached?.key !== key) this.cached = { key, t: this.transportFor(s, pass) };
    return { t: this.cached.t, from: s.from };
  }
}
