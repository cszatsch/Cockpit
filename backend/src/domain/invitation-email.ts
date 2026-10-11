import { esc } from './notification-email';

/**
 * E-mail d'invitation à Cockpit (texte du commanditaire, 11/10/2026) : objet, version texte et version HTML. Mise en
 * page compatible avec les messageries (tableaux, styles en ligne, 600 px, sans image ni police distante), dans la
 * palette de Cockpit : encre marine, vert d'eau, trait ambre. Lecture immédiate : le prénom en titre, une phrase pour
 * dire de quoi il s'agit, un seul bouton, puis l'essentiel à savoir — lien personnel, date limite mise en relief,
 * adresse de connexion — et l'aide en cas de souci ; la mise en garde ferme le message, en petit.
 */

export interface InvitationInput {
  /** Nom complet du compte (le prénom ouvre le message). */ fullName: string;
  /** Adresse de connexion. */ email: string;
  /** Lien d'activation (usage unique). */ link: string;
  /** Durée de validité du lien, en jours. */ validityDays: number;
  /** Date limite du lien (AAAA-MM-JJ). */ expiresIso: string;
  /** Relance : nouveau lien après une première invitation. */ again?: boolean;
}

/** Palette de Cockpit (écrans) reprise dans l'e-mail. */
export const INVITE_COLORS = { paper: 'F3F6F5', card: 'FFFFFF', ink: '10233A', text: '43586A', muted: '5C7280', subtle: '8A9AA6', rule: 'E3EAE8', soft: 'F3F7F6', teal: '1D8F86', tealDark: '146B64', amber: 'F7A41C' };
const SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « 25 octobre 2026 » (1er pour le premier du mois). */
export function longFrDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d === 1 ? '1er' : d} ${MONTHS[m - 1]} ${y}`;
}
/** Prénom : premier mot du nom complet (sinon le nom tel quel). */
export const firstNameOf = (fullName: string) => fullName.trim().split(/\s+/)[0] || fullName.trim();
/** Texte échappé avec les espaces insécables de la typographie française. */
const fr = (s: string) => esc(s).replace(/\s+([:;?!»])/g, '&nbsp;$1').replace(/«\s+/g, '«&nbsp;');

export function invitationEmail(x: InvitationInput): { subject: string; text: string; html: string } {
  const first = firstNameOf(x.fullName), until = longFrDate(x.expiresIso);
  const subject = x.again ? 'Votre invitation à rejoindre l’application Cockpit (nouveau lien)' : 'Votre invitation à rejoindre l’application Cockpit';
  const intro = 'Vous avez été invité(e) à rejoindre Cockpit, votre espace de gestion de pilotage projet en ligne.';
  const how = 'Pour activer votre compte, il vous suffit de définir votre mot de passe en cliquant sur le lien ci-dessous :';
  const facts = [
    'Ce lien est personnel et ne peut être utilisé qu’une seule fois.',
    `Il reste valable pendant ${x.validityDays} jours, soit jusqu’au ${until}.`,
    'Une fois votre mot de passe choisi, vous pourrez vous connecter à tout moment avec votre adresse e-mail.',
  ];
  const help = 'Si le lien a expiré ou ne fonctionne pas, contactez la personne qui vous a invité(e) pour recevoir une nouvelle invitation.';
  const ignore = 'Si vous n’attendiez pas cette invitation, vous pouvez ignorer ce message : aucun compte ne sera activé sans votre action.';
  const text = [`Bonjour ${first},`, intro, how, `Activer mon compte : ${x.link}`, `À savoir :\n${facts.map((f) => `- ${f}`).join('\n')}`, help, ignore, 'À très bientôt sur Cockpit,\nL’équipe Cockpit'].join('\n\n');

  const C = INVITE_COLORS, link = esc(x.link);
  const p = (body: string, o: { size?: number; color?: string; top?: number; weight?: number } = {}) =>
    `<p style="margin:${o.top ?? 0}px 0 0;font-family:${SANS};font-size:${o.size ?? 15}px;line-height:1.6;color:#${o.color ?? C.text};font-weight:${o.weight ?? 400}">${body}</p>`;
  // « À savoir » : trois repères alignés, la date limite en relief (le seul élément daté du message).
  const fact = (mark: string, body: string, last = false) => `<tr>
      <td valign="top" width="44" style="padding:14px 0 ${last ? 4 : 14}px;${last ? '' : `border-bottom:1px solid #${C.rule};`}"><div style="width:28px;height:28px;border-radius:8px;background:#${C.card};border:1px solid #${C.rule};text-align:center;font-family:${SANS};font-size:11px;line-height:28px;font-weight:800;color:#${C.teal};white-space:nowrap">${mark}</div></td>
      <td valign="top" style="padding:18px 0 ${last ? 4 : 14}px;${last ? '' : `border-bottom:1px solid #${C.rule};`}font-family:${SANS};font-size:14px;line-height:1.55;color:#${C.text}">${body}</td>
    </tr>`;
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${fr(subject)}</title><style>@media (max-width:480px){.inv-card{padding:30px 22px 26px!important}.inv-h1{font-size:26px!important}}</style></head>
<body style="margin:0;padding:0;background:#${C.paper};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">Définissez votre mot de passe pour activer votre compte Cockpit — lien valable jusqu’au ${esc(until)}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#${C.paper};"><tr><td align="center" style="padding:40px 16px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
    <tr><td style="padding:0 8px 18px;font-family:${SANS};font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#${C.ink};font-weight:800">Cockpit <span style="font-weight:400;letter-spacing:0;text-transform:none;color:#${C.subtle};font-size:12px">by onepoint</span></td></tr>
    <tr><td class="inv-card" style="background:#${C.card};border-radius:18px;border:1px solid #${C.rule};padding:44px 44px 36px;">
      <div style="width:36px;height:4px;border-radius:2px;background:#${C.amber};font-size:0;line-height:0">&nbsp;</div>
      <p style="margin:22px 0 0;font-family:${SANS};font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#${C.tealDark};font-weight:700">${x.again ? 'Nouveau lien d’invitation' : 'Invitation'}</p>
      <h1 class="inv-h1" style="margin:10px 0 0;font-family:${SANS};font-size:30px;line-height:1.2;letter-spacing:-.02em;color:#${C.ink};font-weight:800">Bonjour ${esc(first)},</h1>
      ${p(fr(intro).replace('Cockpit', `<strong style="color:#${C.ink}">Cockpit</strong>`), { size: 16, top: 14 })}
      ${p(fr(how), { top: 14 })}
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 0;"><tr><td style="border-radius:12px;background:#${C.ink};">
        <a href="${link}" style="display:inline-block;padding:16px 30px;font-family:${SANS};font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:12px;">Activer mon compte&nbsp;&nbsp;&rarr;</a>
      </td></tr></table>
      ${p(`Le bouton ne fonctionne pas&nbsp;? Copiez ce lien dans votre navigateur&nbsp;:<br><a href="${link}" style="color:#${C.teal};text-decoration:none;word-break:break-all">${link}</a>`, { size: 12, color: C.subtle, top: 14 })}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0 0;background:#${C.soft};border-radius:14px;"><tr><td style="padding:20px 22px 12px;">
        <p style="margin:0;font-family:${SANS};font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#${C.muted};font-weight:700">À savoir</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px;">
          ${fact('1×', fr(facts[0]))}
          ${fact(`${x.validityDays}&nbsp;j`, `Il reste valable pendant ${x.validityDays}&nbsp;jours, soit jusqu’au <strong style="color:#${C.ink};white-space:nowrap">${esc(until)}</strong>.`)}
          ${fact('@', `${fr('Une fois votre mot de passe choisi, vous pourrez vous connecter à tout moment avec votre adresse e-mail')} <strong style="color:#${C.ink}">${esc(x.email)}</strong>.`, true)}
        </table>
      </td></tr></table>
      ${p(fr(help), { size: 14, top: 26 })}
      ${p(`À très bientôt sur Cockpit,<br><strong style="color:#${C.ink}">L’équipe Cockpit</strong>`, { top: 22 })}
    </td></tr>
    <tr><td style="padding:22px 12px 0;font-family:${SANS};font-size:12px;line-height:1.6;color:#${C.subtle};text-align:center">${fr(ignore)}</td></tr>
  </table>
</td></tr></table>
</body></html>`;
  return { subject, text, html };
}
