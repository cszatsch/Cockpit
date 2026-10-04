/**
 * E-mail des notifications (04/10/2026) : le Markdown léger rédigé par l'IA (structure `NOTIFICATION_STRUCTURE` :
 * l'essentiel en une phrase, 2 à 4 chiffres clés, « ## À surveiller » avec un code par ligne, « ## À faire »
 * numéroté) est lu en blocs, comme dans le tiroir du Cockpit (`Notifications Cockpit.dc.html`, `parseBody`), puis mis
 * en page en HTML compatible avec les messageries : tableaux, styles en ligne, 600 px, Georgia pour le titre et les
 * chiffres, Helvetica / Arial pour le texte. Lecture immédiate : l'essentiel en titre, les chiffres en grand, les
 * codes colorés selon l'état décrit, les actions dans un bloc sombre, les échéances mises en relief.
 */

export type EmailBlock =
  | { k: 'intro'; text: string }
  | { k: 'lead'; text: string }
  | { k: 'p'; text: string }
  | { k: 'kpi'; items: Array<{ value: string; of: string | null; label: string }> }
  | { k: 'watch'; title: string; items: Array<{ code: string; text: string }> }
  | { k: 'todo'; title: string; items: string[] }
  | { k: 'list'; title: string | null; items: string[] };

/** Palette : papier chaud, encre, rouge (risque), ambre (vigilance), vert d'eau (maîtrisé), filets. */
export const EMAIL_COLORS = { paper: 'FAF9F6', card: 'FFFFFF', ink: '1D1C1A', text: '3A3835', muted: '6F6B64', subtle: '9C978F', rule: 'E6E2DB', risk: 'B5382B', watch: 'A2650C', ok: '146B64', night: '1D1C1A', nightText: 'F4F1EC', nightMuted: 'A59F95', coral: 'E8705A' };
const SERIF = "Georgia,'Times New Roman',Times,serif";
const SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";

const GREET = /^(bonjour|bonsoir|madame|monsieur|cher|chère|hello|veuillez|voici|ci-dessous|vous trouverez)\b/i;
const SIGN = /^(cordialement|bonne journée|bien à vous|à bientôt)\b/i;
const KPI = /^([+−-]?\d[\d\s.,]*\s?(?:%|€|k€|M€|pts?|j)?)\s+(.+)$/;
const CODE = /^((?:[A-Z]{1,3}-?\d{1,4})|J\d{2,})\s*(?:[:–—-]\s*|·\s*)?(.*)$/;
export const RISK = /critique|bloquant|bloqué|retard|dépass|échec|échu|urgent|orphelin|sans plan|aucun plan|sans décision|pas de couverture|non couvert|\bko\b/i;
const WATCH = /mitigation|vigilance|surveill|en cours|à arbitrer|arbitrage|attente|glisse|dérive|tension|instable|échéance|sans avancement/i;
export const toneOf = (t: string): 'risk' | 'watch' | 'neutral' => (RISK.test(t) ? 'risk' : WATCH.test(t) ? 'watch' : 'neutral');

const strip = (t: string) => t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1$2').replace(/`([^`]*)`/g, '$1').trim();
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Texte échappé avec les espaces insécables de la typographie française (avant « : ; ? ! », dans les guillemets). */
const fr = (s: string) => esc(s).replace(/\s+([:;?!»])/g, '&nbsp;$1').replace(/«\s+/g, '«&nbsp;');

/** Lecture du contenu en blocs : salutations en introduction, première phrase utile en titre, listes typées. */
export function emailBlocks(md: string): EmailBlock[] {
  type Raw = { k: 'h'; text: string } | { k: 'p'; lines: string[] } | { k: 'l'; ord: boolean; items: string[] };
  const raw: Raw[] = [];
  let para: { k: 'p'; lines: string[] } | null = null, list: { k: 'l'; ord: boolean; items: string[] } | null = null;
  for (const line of String(md || '').replace(/\r/g, '').split('\n')) {
    const l = line.trim();
    if (!l) { para = null; list = null; continue; }
    let m: RegExpExecArray | null;
    if (/^\|/.test(l)) {
      // Tableau (ancien envoi) : chaque ligne devient une puce « code · texte » ; séparateurs et en-tête ignorés.
      if (/^\|?[\s:|-]+\|?$/.test(l)) continue;
      const cells = l.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => strip(c));
      if (!CODE.test(cells[0])) continue;
      if (!list || list.ord) { para = null; list = { k: 'l', ord: false, items: [] }; raw.push(list); }
      list.items.push(`${cells[0]} ${cells.slice(1).filter(Boolean).join(' · ')}`);
      continue;
    }
    if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) { para = null; list = null; if (m[1].length > 1) raw.push({ k: 'h', text: strip(m[2]).replace(/\s*:$/, '') }); continue; }
    if (/^([-*_])\1{2,}$/.test(l)) { para = null; list = null; continue; }
    const b = /^[-*•]\s+(.*)$/.exec(l), o = /^\d+[.)]\s+(.*)$/.exec(l);
    if (b || o) {
      const ord = !!o;
      if (!list || list.ord !== ord) { para = null; list = { k: 'l', ord, items: [] }; raw.push(list); }
      list.items.push(strip((o ?? b)![1]));
      continue;
    }
    list = null;
    if (!para) { para = { k: 'p', lines: [] }; raw.push(para); }
    para.lines.push(strip(l));
  }
  const out: EmailBlock[] = [];
  let section: string | null = null, lead = false;
  for (const r of raw) {
    if (r.k === 'h') { section = r.text; continue; }
    if (r.k === 'p') {
      const text = r.lines.join(' ');
      if (SIGN.test(text)) continue;
      if (!lead && GREET.test(text)) { out.push({ k: 'intro', text: r.lines.join('\n') }); continue; }
      if (!lead) { lead = true; out.push({ k: 'lead', text }); continue; }
      out.push({ k: 'p', text });
      continue;
    }
    const sec = section;
    section = null;
    // Chiffres clés : 2 à 6 puces commençant toutes par une valeur, hors rubrique.
    const kp = !r.ord && !sec && r.items.length >= 2 && r.items.length <= 6 ? r.items.map((i) => KPI.exec(i)) : [];
    if (kp.length && kp.every(Boolean)) {
      out.push({ k: 'kpi', items: kp.map((m) => { const label = m![2].replace(/\s*\(([^)]*)\)\s*$/, ''); const of = /^(?:\/|sur)\s*(\d[\d\s.,]*)\s+(.*)$/i.exec(label); return { value: m![1].trim(), of: of ? of[1].trim() : null, label: of ? of[2] : label }; }) });
      continue;
    }
    const codes = r.items.map((i) => CODE.exec(i));
    if (codes.every(Boolean)) { out.push({ k: 'watch', title: sec ?? 'À surveiller', items: codes.map((c) => ({ code: c![1], text: c![2] })) }); continue; }
    if (r.ord || (sec && /^(à faire|actions?( attendues| à mener)?|prochaines étapes|recommandations?)$/i.test(sec))) { out.push({ k: 'todo', title: sec ?? 'À faire', items: r.items }); continue; }
    out.push({ k: 'list', title: sec, items: r.items });
  }
  return out;
}

export interface EmailContext {
  /** Nom de la règle (rubrique en tête, ex. « Analyse des risques »). */
  rule: string;
  project: string;
  /** Date d'envoi lisible (« 4 oct. 2026 »). */
  date: string;
  /** Profil du destinataire (« PMO », « Responsable »…). */
  profile?: string | null;
  appUrl?: string | null;
  from?: string | null;
}

const num = (v: string) => Number(v.replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
/** Échéances mises en relief dans les actions : « avant 14/10 », « d'ici vendredi », « le 14 oct. ». */
const DUE = /((?:avant|d['’]ici|au plus tard(?: le)?|pour)\s+(?:le\s+)?(?:\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?|\d{1,2}\s+[a-zéû]{3,9}\.?|lundi|mardi|mercredi|jeudi|vendredi|la fin du mois|la fin de la semaine|le prochain [A-Z]{2,}))/i;

/** HTML de l'e-mail ; `text` (version texte) reste fourni à part par `mailText`. */
export function notificationHtml(md: string, ctx: EmailContext): string {
  const C = EMAIL_COLORS, blocks = emailBlocks(md);
  const leadText = blocks.find((b) => b.k === 'lead') as { text: string } | undefined;
  const all = blocks.map((b) => JSON.stringify(b)).join(' ');
  const tone = toneOf(all), toneColor = tone === 'risk' ? C.risk : tone === 'watch' ? C.watch : C.ok;
  const parts: string[] = [];
  const label = (t: string, color = C.ink) => `<div style="font-family:${SANS};font-size:11px;line-height:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#${color}">${esc(t)}</div>`;
  for (const b of blocks) {
    if (b.k === 'intro') parts.push(`<tr><td style="padding:0 0 26px;font-family:${SANS};font-size:15px;line-height:24px;color:#${C.text}">${b.text.split('\n').map(fr).join('<br>')}</td></tr>`);
    if (b.k === 'lead') {
      parts.push(`<tr><td style="padding:0 0 14px;font-family:${SANS};font-size:11px;line-height:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#${toneColor}"><span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:#${toneColor};vertical-align:-1px;margin-right:12px">&nbsp;</span>${esc(ctx.rule)}</td></tr>`);
      // Titre : l'essentiel ; corps réduit pour une phrase longue.
      const long = b.text.length > 150;
      parts.push(`<tr><td style="padding:0 0 34px;font-family:${SERIF};font-size:${long ? 25 : 30}px;line-height:${long ? 33 : 38}px;font-weight:400;color:#${C.ink};letter-spacing:-0.3px">${fr(b.text)}</td></tr>`);
    }
    if (b.k === 'p') parts.push(`<tr><td style="padding:0 0 22px;font-family:${SANS};font-size:15px;line-height:24px;color:#${C.text}">${fr(b.text)}</td></tr>`);
    if (b.k === 'kpi') {
      const cells = b.items.map((it, i) => {
        const n = num(it.value), risk = RISK.test(it.label) || (/criticit/i.test(it.label) && n >= 20), d = it.of ? num(it.of) : NaN, ratio = it.of && d > 0 && n <= d ? n / d : null;
        const over = it.of && d > 0 && n > d;
        const color = risk || over ? C.risk : C.ink;
        const bar = ratio !== null ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px"><tr><td width="${Math.max(2, Math.round(ratio * 100))}%" style="height:3px;background:#${C.ink};font-size:0;line-height:0">&nbsp;</td><td style="height:3px;background:#${C.rule};font-size:0;line-height:0">&nbsp;</td></tr></table>` : '';
        return `<td class="kpi" width="50%" valign="top" style="padding:${i % 2 ? '0 0 30px 12px' : '0 12px 30px 0'}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid #${risk || over ? C.risk : C.ink};padding-top:20px;font-family:${SERIF};font-size:54px;line-height:56px;color:#${color};letter-spacing:-1px">${esc(it.value)}${it.of ? `<span style="font-size:26px;letter-spacing:0;color:#${C.subtle}">&nbsp;/&nbsp;${esc(it.of)}</span>` : ''}</td></tr><tr><td style="padding-top:8px;font-family:${SANS};font-size:14px;line-height:21px;color:#${C.text}">${fr(it.label)}</td></tr></table>${bar}</td>`;
      });
      const rows: string[] = [];
      for (let i = 0; i < cells.length; i += 2) rows.push(`<tr>${cells[i]}${cells[i + 1] ?? '<td class="kpi" width="50%" style="padding:0 0 30px 12px">&nbsp;</td>'}</tr>`);
      parts.push(`<tr><td style="padding:4px 0 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join('')}</table></td></tr>`);
    }
    if (b.k === 'watch') {
      const rows = b.items.map((it, i) => { const tn = toneOf(it.text), c = tn === 'risk' ? C.risk : tn === 'watch' ? C.watch : C.ink; return `<tr><td valign="top" style="width:76px;padding:16px 0;${i ? `border-top:1px solid #${C.rule};` : ''}font-family:${SANS};font-size:13px;line-height:24px;font-weight:700;color:#${c};letter-spacing:0.3px">${esc(it.code)}</td><td valign="top" style="padding:16px 0;${i ? `border-top:1px solid #${C.rule};` : ''}font-family:${SANS};font-size:16px;line-height:24px;color:#${C.ink}">${fr(it.text)}</td></tr>`; });
      parts.push(`<tr><td style="padding:18px 0 34px">${label(b.title)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;border-top:1px solid #${C.ink}">${rows.join('')}</table></td></tr>`);
    }
    if (b.k === 'todo') {
      const items = b.items.map((t, i) => {
        // Précision entre parenthèses en retrait ; échéance en relief.
        const paren = /^(.*?)\s*(\([^)]*\))\s*$/.exec(t), main = paren ? paren[1] : t, tail = paren ? paren[2] : '';
        const html = fr(main).replace(DUE, (m) => `<span style="color:#${C.coral};font-weight:700">${m}</span>`);
        return `<tr><td valign="top" style="width:42px;padding:16px 0;${i ? `border-top:1px solid #3A3835;` : ''}font-family:${SERIF};font-size:19px;line-height:25px;color:#${C.coral}">${i + 1}.</td><td valign="top" style="padding:16px 0;${i ? `border-top:1px solid #3A3835;` : ''}font-family:${SANS};font-size:16px;line-height:25px;color:#${C.nightText}">${html}${tail ? ` <span style="color:#${C.nightMuted}">${fr(tail)}</span>` : ''}</td></tr>`;
      });
      parts.push(`<tr><td style="padding:6px 0 34px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#${C.night};border-radius:6px"><tr><td style="padding:28px 32px 14px">${label(b.title, C.nightText)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px">${items.join('')}</table></td></tr></table></td></tr>`);
    }
    if (b.k === 'list') {
      const items = b.items.map((t) => `<tr><td valign="top" style="width:18px;padding:5px 0;font-family:${SANS};font-size:15px;line-height:23px;color:#${C.subtle}">–</td><td style="padding:5px 0;font-family:${SANS};font-size:15px;line-height:23px;color:#${C.text}">${fr(t)}</td></tr>`).join('');
      parts.push(`<tr><td style="padding:4px 0 28px">${b.title ? `${label(b.title)}<div style="height:10px;line-height:10px;font-size:0">&nbsp;</div>` : ''}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items}</table></td></tr>`);
    }
  }
  const cta = ctx.appUrl ? `<tr><td style="padding:2px 0 34px"><a href="${esc(ctx.appUrl)}" style="font-family:${SANS};font-size:14px;line-height:20px;font-weight:700;color:#${C.ink};text-decoration:none;border-bottom:1px solid #${C.ink};padding-bottom:2px">Ouvrir RISE Cockpit&nbsp;→</a></td></tr>` : '';
  const why = [ctx.profile ? `Vous recevez cette notification en tant que ${ctx.profile} du projet ${ctx.project}.` : `Projet ${ctx.project}.`].join(' ');
  const footer = `<tr><td style="padding:22px 0 0;border-top:1px solid #${C.rule};font-family:${SANS};font-size:12px;line-height:19px;color:#${C.muted};letter-spacing:0.2px">RISE Cockpit${ctx.from ? ` · ${esc(ctx.from)}` : ''}<br><span style="color:#${C.subtle}">${esc(why)}</span></td></tr>`;
  const head = `<tr><td style="padding:0 0 30px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-family:${SANS};font-size:12px;line-height:16px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#${C.ink}">RISE <span style="font-weight:400;color:#${C.subtle}">Cockpit</span></td><td align="right" style="font-family:${SANS};font-size:12px;line-height:16px;color:#${C.muted}">${esc(ctx.project)} · ${esc(ctx.date)}</td></tr></table></td></tr>`;
  const pre = leadText ? esc(leadText.text) : '';
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(ctx.rule)}</title><style>@media (max-width:620px){.wrap{padding:28px 20px!important}.kpi{display:block!important;width:100%!important;padding:0 0 26px!important}}</style></head>`
    + `<body style="margin:0;padding:0;background:#${C.paper};-webkit-text-size-adjust:100%"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#${C.paper}">${pre}</div>`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#${C.paper}"><tr><td align="center" style="padding:24px 12px">`
    + `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px"><tr><td class="wrap" style="padding:40px 40px 36px">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${head}${parts.join('')}${cta}${footer}</table>`
    + `</td></tr></table></td></tr></table></body></html>`;
}
