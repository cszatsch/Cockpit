import net from 'net';
import tls from 'tls';
import { netErrorCode, SMTP_CONNECT_TIMEOUT_MS, SMTP_GREETING_TIMEOUT_MS, SMTP_REPLY_TIMEOUT_MS, smtpFailStep, SmtpDraft, SmtpStep } from '../domain/smtp';

/** Résultat d'un test de connexion (spécification SMTP § 6) ; `connectMs` et `tls` alimentent les étapes de la vue. */
export interface SmtpProbeResult {
  ok: boolean;
  step: SmtpStep | null;
  code: string;
  ms: number;
  connectMs: number | null;
  tls: string | null;
}

interface Reply {
  code: number;
  first: string;
  lines: string[];
}

/** Réponse SMTP complète (lignes « 250-… » puis « 250 … ») en tête du tampon ; null si incomplète. */
export function parseReply(buf: string): (Reply & { len: number }) | null {
  const lines: string[] = [];
  let pos = 0;
  for (;;) {
    const end = buf.indexOf('\n', pos);
    if (end < 0) return null;
    const line = buf.slice(pos, end).replace(/\r$/, '');
    pos = end + 1;
    lines.push(line);
    const m = /^(\d{3})([ -]?)/.exec(line);
    if (!m) return { code: 0, first: lines[0], lines, len: pos };
    if (m[2] !== '-') return { code: Number(m[1]), first: lines[0], lines, len: pos };
  }
}

/** Lecture des réponses sur une socket (en clair, puis TLS après STARTTLS). */
class Dialog {
  private buf = '';
  private waiter: { resolve: (r: Reply) => void; reject: (e: Error) => void; timer: NodeJS.Timeout } | null = null;
  private err: Error | null = null;
  constructor(public sock: net.Socket, private timeoutMs: number) {
    this.attach(sock);
  }
  attach(sock: net.Socket) {
    this.sock = sock;
    this.buf = '';
    sock.on('data', (c: Buffer) => {
      this.buf += c.toString('utf8');
      this.flush();
    });
    sock.on('error', (e) => this.fail(e));
    sock.on('close', () => this.fail(Object.assign(new Error('Connexion fermée par le serveur'), { code: 'ECONNRESET' })));
  }
  detach() {
    this.sock.removeAllListeners('data');
    this.sock.removeAllListeners('error');
    this.sock.removeAllListeners('close');
  }
  private flush() {
    const r = parseReply(this.buf);
    if (!r || !this.waiter) return;
    this.buf = this.buf.slice(r.len);
    const w = this.waiter;
    this.waiter = null;
    clearTimeout(w.timer);
    w.resolve(r);
  }
  private fail(e: Error) {
    this.err = this.err ?? e;
    if (!this.waiter) return;
    const w = this.waiter;
    this.waiter = null;
    clearTimeout(w.timer);
    w.reject(e);
  }
  reply(timeoutMs = this.timeoutMs): Promise<Reply> {
    if (this.err) return Promise.reject(this.err);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = null;
        reject(Object.assign(new Error('Pas de réponse du serveur'), { code: 'EREPLYTIMEOUT' }));
      }, timeoutMs);
      this.waiter = { resolve, reject, timer };
      this.flush();
    });
  }
  cmd(line: string): Promise<Reply> {
    this.sock.write(line + '\r\n');
    return this.reply();
  }
}

class Fail extends Error {
  constructor(public step: SmtpStep, public smtp: string) {
    super(smtp);
  }
}

const NET_CODES = ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH'];
// Première ligne de la réponse, sans le renvoi vers l'aide de Gmail (« For more information, go to »).
const codeOf = (r: Reply) => r.first.replace(/^(\d{3})-/, '$1 ').replace(/\s*For more information, go to\s*$/i, '').slice(0, 200);
const tlsLabel = (p: string | null) => (p ? p.replace(/^TLSv/, 'TLS ') : null);

/** Connexion TCP (ou TLS implicite) avec délai ; `onTcp` : instant de la connexion TCP. */
function open(d: SmtpDraft, timeoutMs: number, onTcp: () => void): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const sock: net.Socket = d.enc === 'ssl' ? tls.connect({ host: d.host, port: d.port, servername: net.isIP(d.host) ? undefined : d.host }) : net.connect({ host: d.host, port: d.port });
    let tcp = false;
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new Fail(tcp ? 'tls' : 'connect', tcp ? 'Délai dépassé pendant la négociation TLS' : `connect ETIMEDOUT ${d.host}:${d.port}`));
    }, timeoutMs);
    sock.once('connect', () => {
      tcp = true;
      onTcp();
    });
    sock.once(d.enc === 'ssl' ? 'secureConnect' : 'connect', () => {
      clearTimeout(timer);
      sock.removeAllListeners('error');
      resolve(sock);
    });
    sock.once('error', (e: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      sock.destroy();
      reject(new Fail(!tcp || NET_CODES.includes(e.code ?? '') ? 'connect' : 'tls', netErrorCode(e)));
    });
  });
}

function upgrade(sock: net.Socket, host: string, timeoutMs: number): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const t = tls.connect({ socket: sock, servername: net.isIP(host) ? undefined : host });
    const timer = setTimeout(() => {
      t.destroy();
      reject(new Fail('tls', 'Délai dépassé pendant la négociation TLS'));
    }, timeoutMs);
    t.once('secureConnect', () => {
      clearTimeout(timer);
      t.removeAllListeners('error');
      resolve(t);
    });
    t.once('error', (e) => {
      clearTimeout(timer);
      reject(new Fail('tls', netErrorCode(e)));
    });
  });
}

/**
 * Vrai dialogue SMTP, exécuté côté serveur (spécification SMTP § 4 et § 6) : connexion, chiffrement (TLS implicite
 * ou STARTTLS), authentification (PLAIN ou LOGIN), puis MAIL FROM (annulé par RSET : aucun message n'est envoyé).
 * Renvoie l'étape en échec, le code SMTP réel (ou l'erreur réseau / TLS) et la durée. Le mot de passe n'apparaît
 * jamais dans le résultat.
 */
export async function smtpProbe(d: SmtpDraft, password: string | null, opts: { connectTimeoutMs?: number; replyTimeoutMs?: number } = {}): Promise<SmtpProbeResult> {
  const t0 = Date.now();
  let connectMs: number | null = null;
  let tlsVer: string | null = null;
  let dialog: Dialog | null = null;
  const done = (ok: boolean, step: SmtpStep | null, code: string): SmtpProbeResult => ({ ok, step, code, ms: Date.now() - t0, connectMs, tls: tlsLabel(tlsVer) });
  try {
    const sock = await open(d, opts.connectTimeoutMs ?? SMTP_CONNECT_TIMEOUT_MS, () => (connectMs = Date.now() - t0));
    if (d.enc === 'ssl') tlsVer = (sock as tls.TLSSocket).getProtocol();
    dialog = new Dialog(sock, opts.replyTimeoutMs ?? SMTP_REPLY_TIMEOUT_MS);
    const D = dialog;
    const step = async (at: SmtpStep, p: Promise<Reply>, want: number[]): Promise<Reply> => {
      let r: Reply;
      try {
        r = await p;
      } catch (e: any) {
        throw e instanceof Fail ? e : new Fail(at, netErrorCode(e));
      }
      if (!want.includes(r.code)) throw new Fail(smtpFailStep(at, codeOf(r)), codeOf(r));
      return r;
    };
    // Accueil : un serveur muet après la connexion attend en général TLS dès l'ouverture (port 465).
    try {
      const g = await D.reply(opts.replyTimeoutMs ?? SMTP_GREETING_TIMEOUT_MS);
      if (g.code !== 220) throw new Fail('connect', codeOf(g));
    } catch (e: any) {
      if (e instanceof Fail) throw e;
      if (e?.code === 'EREPLYTIMEOUT') throw new Fail(d.enc === 'ssl' ? 'connect' : 'tls', 'Greeting never received');
      throw new Fail('connect', netErrorCode(e));
    }
    let ehlo = await step('connect', D.cmd('EHLO rise-cockpit'), [250]);
    if (d.enc === 'starttls') {
      if (!ehlo.lines.some((l) => /^250[ -]STARTTLS\b/i.test(l))) throw new Fail('tls', 'STARTTLS non proposé par le serveur');
      await step('tls', D.cmd('STARTTLS'), [220]);
      D.detach();
      const t = await upgrade(D.sock, d.host, opts.connectTimeoutMs ?? SMTP_CONNECT_TIMEOUT_MS);
      tlsVer = t.getProtocol();
      D.attach(t);
      ehlo = await step('tls', D.cmd('EHLO rise-cockpit'), [250]);
    }
    if (d.auth) {
      const mechs = (ehlo.lines.find((l) => /^250[ -]AUTH[ =]/i.test(l)) ?? '').toUpperCase();
      const user = d.user, pass = password ?? '';
      if (/\bLOGIN\b/.test(mechs) && !/\bPLAIN\b/.test(mechs)) {
        await step('auth', D.cmd('AUTH LOGIN'), [334]);
        await step('auth', D.cmd(Buffer.from(user).toString('base64')), [334]);
        await step('auth', D.cmd(Buffer.from(pass).toString('base64')), [235]);
      } else {
        // PLAIN, y compris quand le serveur n'annonce rien : sa réponse réelle dit pourquoi (ex. STARTTLS exigé).
        await step('auth', D.cmd('AUTH PLAIN ' + Buffer.from(`\u0000${user}\u0000${pass}`).toString('base64')), [235]);
      }
    }
    const mail = await step('from', D.cmd(`MAIL FROM:<${d.from.trim()}>`), [250]);
    await D.cmd('RSET').catch(() => null);
    D.sock.write('QUIT\r\n');
    return done(true, null, codeOf(mail));
  } catch (e: any) {
    return e instanceof Fail ? done(false, e.step, e.smtp) : done(false, 'connect', netErrorCode(e));
  } finally {
    dialog?.sock.destroy();
  }
}
