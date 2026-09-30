/**
 * PDF de test minimal et valide (police Helvetica standard, encodage WinAnsi) : une liste de pages, chacune une liste
 * de lignes positionnées. Sert au dépôt du guide utilisateur (lecture réelle par pdf.js, sans fichier binaire versionné).
 */
export interface FixtureLine { text: string; size: number; x?: number; y: number }

const esc = (s: string) => s.replace(/’/g, "'").replace(/[\\()]/g, (c) => '\\' + c);

export function makePdf(pages: FixtureLine[][], opts: { drawingOnly?: boolean } = {}): Buffer {
  const objs: string[] = [];
  const add = (body: string) => { objs.push(body); return objs.length; };
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('PAGES');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const kids: number[] = [];
  for (const lines of pages) {
    const stream = opts.drawingOnly
      ? '0.5 w 72 700 m 500 100 l S 100 100 300 200 re S'
      : lines.map((l) => `BT /F1 ${l.size} Tf 1 0 0 1 ${l.x ?? 54} ${l.y} Tm (${esc(l.text)}) Tj ET`).join('\n');
    const content = add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** Paragraphe de remplissage réaliste (≈ 60 mots). */
const para = (topic: string) => [
  `La règle ${topic} s'applique à chaque administrateur de la plateforme sans exception.`,
  `Elle est contrôlée par le serveur à chaque enregistrement et tracée dans le journal.`,
  `Un message clair explique la cause du refus et la manière de corriger la saisie.`,
];

/**
 * Guide de test : couverture, deux chapitres, sections et sous-sections, paragraphes et listes en retrait.
 * `tag` distingue deux versions du guide (contenu différent).
 */
export function guidePdf(tag = 'A'): Buffer {
  const page = (blocks: Array<{ h?: [number, string]; p?: string[]; li?: string[] }>): FixtureLine[] => {
    const out: FixtureLine[] = [];
    let y = 780;
    for (const b of blocks) {
      if (b.h) { y -= b.h[0] * 1.8; out.push({ text: b.h[1], size: b.h[0], y }); y -= 6; }
      for (const t of b.p ?? []) { y -= 14.4; out.push({ text: t, size: 9.6, y }); }
      if (b.p) y -= 5;
      for (const t of b.li ?? []) { y -= 16.4; out.push({ text: t, size: 9.6, y, x: 70 }); }
    }
    return out;
  };
  return makePdf([
    [{ text: `Guide utilisateur de test ${tag}`, size: 28, y: 600 }, { text: 'Version de démonstration pour les tests automatiques.', size: 9.6, y: 560 }],
    page([
      { h: [20, '1. Comptes et accès'] },
      { h: [14, '1.1 Inviter un utilisateur'], p: [...para('invitation'), `Le lien d'invitation est valable quatorze jours ${tag}.`] },
      { li: ['Saisissez le nom complet et le courriel professionnel.', 'Choisissez les projets et les chantiers.', 'Cliquez sur Envoyer l’invitation.'] },
      { h: [11, '1.1.1 Relancer une invitation'], p: para('relance') },
      { h: [14, '1.2 Suspendre un compte'], p: [...para('suspension'), 'La suspension ferme toutes les sessions immédiatement.'] },
    ]),
    page([
      { h: [20, '2. Notifications'] },
      { h: [14, '2.1 Règle de rattrapage'], p: [...para('rattrapage'), 'Un envoi manqué part au redémarrage jusqu’au lendemain 23 h 59.', ...para('limite')] },
      { li: ['Seul le plus récent envoi manqué part.', 'Les autres sont notés remplacés.', 'Au-delà de la limite, l’envoi est abandonné.'] },
      { h: [14, '2.2 Historique des envois'], p: [...para('historique'), ...para('statut')] },
    ]),
  ]);
}

/** Guide de test du Cockpit : titres et contenu propres au Cockpit (jamais présents dans le guide de la Console). */
export function cockpitGuidePdf(tag = 'A'): Buffer {
  const lines = (blocks: Array<[number, string] | string>): FixtureLine[] => {
    let y = 780;
    return blocks.map((b) => (typeof b === 'string' ? (y -= 14.4, { text: b, size: 9.6, y }) : (y -= b[0] * 1.8 + 6, { text: b[1], size: b[0], y })));
  };
  return makePdf([
    [{ text: `Guide utilisateur du Cockpit ${tag}`, size: 28, y: 600 }, { text: 'Version de test du guide du Cockpit.', size: 9.6, y: 560 }],
    lines([
      [20, '1. Pilotage du projet'],
      [14, '1.1 Créer une action de pilotage'],
      'Dans l’espace Pilotage, ouvrez l’onglet Actions puis cliquez sur Nouvelle action.',
      'Renseignez le titre, le porteur, le chantier et l’échéance de l’action de pilotage.',
      `L’action apparaît aussitôt dans le tableau des actions du chantier ${tag}.`,
      [14, '1.2 Jalons non confirmés'],
      'Un jalon est signalé non confirmé quand son porteur ne l’a pas revu depuis plus de sept jours.',
      'Le signal disparaît dès que le porteur confirme la date prévue du jalon.',
    ]),
    lines([
      [20, '2. Base de connaissance'],
      [14, '2.1 Déposer un document'],
      'Cliquez sur Déposer un document, choisissez le fichier, puis le type et la confidentialité.',
      'Jev résume le document et l’indexe ; le résumé s’affiche avec l’icône Vue du tableau.',
      'Un document restreint reste visible du PMO et de son auteur seulement.',
    ]),
  ]);
}
