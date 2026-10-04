import { Injectable } from '@nestjs/common';
import { config } from './config';
import { SMTP_SENDER_NAME, SmtpService } from './smtp.service';

export interface Mail {
  to: string[];
  subject: string;
  text: string;
  /** Version HTML (notifications, 04/10/2026) ; le texte reste envoyé comme alternative. */
  html?: string;
}

/**
 * Envoi d'e-mails derrière une interface remplaçable (brief Console § 4) : serveur SMTP de la Console
 * (Plateforme › Serveur d'envoi SMTP, sinon variables SMTP_*), sinon journal applicatif (développement, tests).
 * Les messages envoyés restent consultables en mémoire (`outbox`) pour les tests.
 */
@Injectable()
export class MailerService {
  readonly outbox: Array<Mail & { at: Date }> = [];
  constructor(private readonly smtp: SmtpService) {}

  /** Adresse d'expédition affichée dans le pied des e-mails (Console › Serveur SMTP, sinon configuration). */
  async senderAddress(): Promise<string | null> {
    const tr = await this.smtp.transport().catch(() => null);
    const raw = (tr && tr.from) || config.mailFrom || '';
    return /<([^>]+)>/.exec(raw)?.[1] ?? (raw.includes('@') ? raw.trim() : null);
  }

  async send(mail: Mail): Promise<void> {
    this.outbox.push({ ...mail, at: new Date() });
    if (this.outbox.length > 200) this.outbox.shift();
    const tr = process.env.NODE_ENV === 'test' && !(await this.smtp.row()) ? null : await this.smtp.transport();
    if (tr) {
      await tr.t.sendMail({ from: { name: SMTP_SENDER_NAME, address: tr.from || config.mailFrom }, to: mail.to.join(', '), subject: mail.subject, text: mail.text, ...(mail.html ? { html: mail.html } : {}) });
    } else if (process.env.NODE_ENV !== 'test' && !config.offline) {
      console.log(`[e-mail] → ${mail.to.join(', ')} · ${mail.subject}`);
    }
  }
}
