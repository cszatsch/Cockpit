import { Injectable } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { config } from './config';

export interface Mail {
  to: string[];
  subject: string;
  text: string;
}

/**
 * Envoi d'e-mails derrière une interface remplaçable (brief Console § 4) :
 * SMTP si `SMTP_URL` est défini, sinon journal applicatif (développement, tests).
 * Les messages envoyés restent consultables en mémoire (`outbox`) pour les tests.
 */
@Injectable()
export class MailerService {
  readonly outbox: Array<Mail & { at: Date }> = [];
  private transport = config.smtpUrl ? nodemailer.createTransport(config.smtpUrl) : null;

  async send(mail: Mail): Promise<void> {
    this.outbox.push({ ...mail, at: new Date() });
    if (this.outbox.length > 200) this.outbox.shift();
    if (this.transport) {
      await this.transport.sendMail({ from: config.mailFrom, to: mail.to.join(', '), subject: mail.subject, text: mail.text });
    } else if (process.env.NODE_ENV !== 'test' && !config.offline) {
      console.log(`[e-mail] → ${mail.to.join(', ')} · ${mail.subject}`);
    }
  }
}
