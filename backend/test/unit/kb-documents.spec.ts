import { readDocx, readPptx, readXlsx, tableLines } from '../../src/core/office-text';
import { renderPdf } from '../../src/core/pdf';
import {
  chunkLocation, chunkMetadata, detectFormat, docxChunks, KB_EMPTY, KB_FORMAT_REFUSED, KB_MAX_BYTES, KB_PROTECTED, KB_SUMMARY_INPUT_CHARS, KB_TOO_BIG, kbEmbeddingText, kbMismatch, kbOldFormat,
  kbSizes, parseSummary, pptxChunks, readSummary, escapeControlsInStrings, summaryPrompt, twoSentences, xlsxChunks,
} from '../../src/domain/kb-documents';
import { DEFAULT_CHUNK_SIZES } from '../../src/domain/guide-index';
import { makeDocx, makePptx, makeXlsx, protectedOffice } from '../office-fixture';

/** Base de connaissance du Cockpit (décisions du 30/09/2026) : contrôles, lecture par format, découpage, métadonnées, résumé. */
describe('Base de connaissance — règles', () => {
  it('type réel du fichier : signature et contenu, pas seulement l’extension ; messages clairs', async () => {
    const docx = await makeDocx([{ paras: ['Bonjour'] }]);
    expect(await detectFormat(docx, 'Spec.docx')).toMatchObject({ format: 'DOCX', ext: '.docx' });
    expect(await detectFormat(renderPdf('CR', ['a']), 'CR.PDF')).toMatchObject({ format: 'PDF' });
    expect(await detectFormat(Buffer.alloc(0), 'vide.pdf')).toEqual({ error: KB_EMPTY });
    expect(await detectFormat(Buffer.alloc(KB_MAX_BYTES + 1), 'gros.pdf')).toEqual({ error: KB_TOO_BIG });
    expect(await detectFormat(Buffer.from('MZ'), 'virus.exe')).toEqual({ error: KB_FORMAT_REFUSED });
    expect(await detectFormat(Buffer.from('x'), 'ancien.doc')).toEqual({ error: kbOldFormat('.doc') });
    expect(kbOldFormat('.xls')).toMatch(/Excel, enregistrez-le au format \.xlsx/);
    // Extension trompeuse : un PDF renommé .docx, un Word renommé .xlsx, un texte renommé .pdf.
    expect(await detectFormat(renderPdf('x', ['y']), 'faux.docx')).toEqual({ error: kbMismatch('.docx') });
    expect(await detectFormat(docx, 'faux.xlsx')).toEqual({ error: kbMismatch('.xlsx') });
    expect(await detectFormat(Buffer.from('bonjour'), 'faux.pdf')).toEqual({ error: kbMismatch('.pdf') });
    expect(await detectFormat(protectedOffice(), 'secret.xlsx')).toEqual({ error: KB_PROTECTED });
  });

  it('Word : titres (styles « Titre n »), paragraphes, puces, tableaux « en-tête : valeur » ; découpage par section', async () => {
    const buf = await makeDocx([
      { h: 'Contexte', level: 1, paras: ['Le lot Ventes remplace l’outil actuel.'] },
      { h: 'Exigences', level: 2, items: ['Saisie des opportunités', 'Tableau de bord commercial'], table: [['Exigence', 'Priorité'], ['EX-01 Saisie mobile', 'Haute'], ['EX-02 Export', 'Basse']] },
    ]);
    const blocks = await readDocx(buf);
    expect(blocks[0]).toEqual({ kind: 'heading', level: 1, text: 'Contexte' });
    expect(blocks.find((b) => b.kind === 'item')).toMatchObject({ text: 'Saisie des opportunités', depth: 1 });
    expect(blocks.find((b) => b.kind === 'table')).toEqual({ kind: 'table', rows: [['Exigence', 'Priorité'], ['EX-01 Saisie mobile', 'Haute'], ['EX-02 Export', 'Basse']] });
    expect(tableLines([['Exigence', 'Priorité'], ['EX-01', 'Haute']])).toEqual(['Exigence : EX-01 ; Priorité : Haute']);
    const chunks = docxChunks(blocks, 'Spécifications CRM', DEFAULT_CHUNK_SIZES);
    expect(chunks.map((c) => c.section)).toEqual(['Contexte', 'Contexte › Exigences']);
    expect(chunks[1].content).toContain('Exigence : EX-01 Saisie mobile ; Priorité : Haute');
    expect(chunks[1]).toMatchObject({ pageStart: null, slide: null, sheet: null });
  });

  it('PowerPoint : texte de chaque diapositive avec son numéro, tableaux et notes de l’orateur ; une diapositive par extrait', async () => {
    const buf = await makePptx([
      { title: 'COPIL n°19', lines: ['Go-Live reporté au 1er avril'], notes: ['Insister sur la répétition générale.'] },
      { lines: ['Diapositive sans titre'], table: [['Jalon', 'Date'], ['Bascule', '14/10']] },
      {},
    ]);
    const slides = await readPptx(buf);
    expect(slides[0]).toMatchObject({ n: 1, title: 'COPIL n°19', lines: ['Go-Live reporté au 1er avril'], notes: ['Insister sur la répétition générale.'] });
    expect(slides[1].lines).toEqual(['Diapositive sans titre', 'Jalon : Bascule ; Date : 14/10']);
    const chunks = pptxChunks(slides, DEFAULT_CHUNK_SIZES);
    expect(chunks.map((c) => [c.slide, c.heading])).toEqual([[1, 'COPIL n°19'], [2, 'Diapositive 2']]);
    expect(chunks[0].content).toContain('Notes de l’orateur : Insister sur la répétition générale.');
    expect(chunkLocation(chunks[0])).toBe('Diapositive 1 · COPIL n°19');
  });

  it('Excel : chaque onglet, en-têtes de colonnes, « colonne : valeur » ligne par ligne ; groupes de lignes', async () => {
    const buf = await makeXlsx([
      { name: 'Budget', rows: [['Poste', 'Montant', 'Date'], ['Licences', 120000, new Date('2026-10-01T00:00:00Z')], ['Intégration', 80000, null]] },
      { name: 'Vide', rows: [] },
      { name: 'Notes', rows: [['Une seule cellule']] },
    ]);
    const sheets = await readXlsx(buf);
    expect(sheets.map((s) => s.name)).toEqual(['Budget', 'Notes']);
    expect(sheets[0].header).toEqual(['Poste', 'Montant', 'Date']);
    expect(sheets[0].rows).toEqual([{ n: 2, text: 'Poste : Licences ; Montant : 120000 ; Date : 2026-10-01' }, { n: 3, text: 'Poste : Intégration ; Montant : 80000' }]);
    const chunks = xlsxChunks(sheets, DEFAULT_CHUNK_SIZES);
    expect(chunks[0]).toMatchObject({ sheet: 'Budget', rowStart: 2, rowEnd: 3, section: 'Onglet Budget' });
    expect(chunkLocation(chunks[0])).toBe('Onglet Budget · lignes 2-3');
    // Beaucoup de lignes : plusieurs extraits, rangées d'origine gardées, aucune ligne perdue.
    const many = xlsxChunks([{ name: 'Suivi', header: ['A'], truncated: false, rows: Array.from({ length: 400 }, (_, i) => ({ n: i + 2, text: `A : interface numéro ${i} en recette` })) }], DEFAULT_CHUNK_SIZES);
    expect(many.length).toBeGreaterThan(2);
    expect(many[0].rowStart).toBe(2);
    expect(many[many.length - 1].rowEnd).toBe(401);
    expect(many.map((c) => c.content.split('\n').length).reduce((a, b) => a + b, 0)).toBe(400);
  });

  it('métadonnées de chaque extrait et texte vectorisé enrichi (nom, date de dépôt, description en tête)', () => {
    const meta = { name: 'Support COPIL n°19', depositedAt: '2026-09-30', description: 'Support du 19e COPIL. Il présente le report du Go-Live.' };
    const slide = { position: 0, section: 'Diapositive 3 · Planning', heading: 'Planning', content: 'Bascule le 14/10.', pageStart: null, pageEnd: null, slide: 3, sheet: null, rowStart: null, rowEnd: null, tokens: 5 };
    expect(chunkMetadata(meta, slide)).toEqual({ document: 'Support COPIL n°19', deposeLe: '2026-09-30', description: meta.description, diapositive: 3, titre: 'Planning' });
    expect(kbEmbeddingText(meta, slide)).toBe('Document : Support COPIL n°19\nDéposé le : 2026-09-30\nDescription : Support du 19e COPIL. Il présente le report du Go-Live.\nDiapositive 3 · Planning\n\nBascule le 14/10.');
    const pdf = { ...slide, slide: null, section: '2. Planning', pageStart: 4, pageEnd: 5 };
    expect(chunkMetadata(meta, pdf)).toMatchObject({ section: '2. Planning', page: 4, pageFin: 5 });
    expect(chunkLocation(pdf)).toBe('Section : 2. Planning · p. 4-5');
  });

  it('tailles adaptées au modèle d’embedding : celles du guide, réduites pour une petite fenêtre', () => {
    expect(kbSizes(8192)).toEqual(DEFAULT_CHUNK_SIZES);
    expect(kbSizes(null)).toEqual(DEFAULT_CHUNK_SIZES);
    const small = kbSizes(512);
    expect(small.target).toBe(128);
    expect(small.max).toBeLessThanOrEqual(256);
    expect(small.overlap).toBeLessThan(small.target);
  });

  it('résumé structuré : description, chiffres clés, rubriques ; bornes ; jamais de JSON brut', () => {
    const raw = '```json\n' + JSON.stringify({ description: 'Un. Deux. Trois.', chiffres: [{ valeur: '3,0 Md€', libelle: 'CA visé en 2028' }, { valeur: '', libelle: 'vide' }], rubriques: [{ titre: 'Contexte', points: ['Point **clé**.'] }, { titre: 'Vide', points: [] }] }) + '\n```';
    const p = parseSummary(raw, 'x');
    expect(p.description).toBe('Un. Deux.');
    expect(JSON.parse(p.summary)).toEqual({ description: 'Un. Deux.', figures: [{ value: '3,0 Md€', label: 'CA visé en 2028' }], sections: [{ title: 'Contexte', points: ['Point **clé**.'] }] });
    expect(readSummary(p.summary)).toEqual(JSON.parse(p.summary));
    const many = readSummary(JSON.stringify({ description: 'A.', chiffres: Array.from({ length: 9 }, (_, i) => ({ valeur: String(i), libelle: 'x' })), rubriques: Array.from({ length: 9 }, (_, i) => ({ titre: 'T' + i, points: ['a', 'b', 'c', 'd', 'e'] })) }))!;
    expect([many.figures.length, many.sections.length, many.sections[0].points.length]).toEqual([4, 5, 4]);
  });

  it('résumé : réponse coupée ou invalide récupérée (retours à la ligne bruts, ancien format « resume »), dernier point inachevé écarté', () => {
    // Ancien format, coupé en cours de route, avec des retours à la ligne bruts dans la chaîne (JSON invalide).
    const cut = '{"description": "Support du lancement. Il sert de référence.", "resume": "## Contexte\\nLancement du projet **SAP**.\n\n## Organisation\nÉquipe de 70 personnes. Rôles clés : Sponsors (A. Louet, C. Le';
    expect(readSummary(cut)).toEqual({ description: 'Support du lancement. Il sert de référence.', figures: [], sections: [{ title: 'Contexte', points: ['Lancement du projet **SAP**.'] }, { title: 'Organisation', points: ['Équipe de 70 personnes.'] }] });
    // Nouveau format coupé : seuls les éléments complets sont gardés.
    const cut2 = '{"description": "Un. Deux.", "chiffres": [{"valeur": "418", "libelle": "vendeurs"}], "rubriques": [{"titre": "Enjeux", "points": ["A.", "B."]}, {"titre": "Planning", "points": ["Lot 1 en 20';
    expect(readSummary(cut2)).toEqual({ description: 'Un. Deux.', figures: [{ value: '418', label: 'vendeurs' }], sections: [{ title: 'Enjeux', points: ['A.', 'B.'] }] });
    // Texte libre : rubriques Markdown ; réponse vide : description tirée du document.
    expect(readSummary('Synthèse libre.')).toEqual({ description: '', figures: [], sections: [{ title: 'Points clés', points: ['Synthèse libre.'] }] });
    expect(parseSummary('', 'Texte du document. Suite du texte. Fin.').description).toBe('Texte du document. Suite du texte.');
    expect(escapeControlsInStrings('{"a": "x\ny"}\n')).toBe('{"a": "x\\ny"}\n');
  });

  it('résumé : texte envoyé au modèle borné', () => {
    expect(twoSentences('Sans point final')).toBe('Sans point final');
    const big = Array.from({ length: 200 }, (_, i) => ({ position: i, section: 'S', heading: 'S', content: 'x'.repeat(1000), pageStart: 1, pageEnd: 1, slide: null, sheet: null, rowStart: null, rowEnd: null, tokens: 250 }));
    const r = summaryPrompt('Doc', 'Livrable', 'PDF', big);
    expect(r.truncated).toBe(true);
    expect(r.prompt.length).toBeLessThanOrEqual(KB_SUMMARY_INPUT_CHARS + 200);
    expect(r.prompt).toMatch(/début du document seulement/);
  });
});
