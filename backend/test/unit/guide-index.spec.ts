import fs from 'fs';
import path from 'path';
import { readPdfLines } from '../../src/core/pdf-text';
import {
  chunkBlocks, CHUNK_MAX_TOKENS, CHUNK_OVERLAP_TOKENS, CHUNK_TARGET_TOKENS, embeddingText, estimateTokens, hashEmbedding, hnswIndexSql, PdfLine, scannedReason, stripRepeated, toBlocks,
} from '../../src/domain/guide-index';

const L = (page: number, y: number, text: string, size = 10, x = 50): PdfLine => ({ page, x, y, size, text, pageHeight: 800 });
const sentence = (i: number) => `Phrase numéro ${i} qui décrit une règle de gestion de la console avec assez de mots pour peser.`;

describe('Guide utilisateur — structure et découpage (décision du 30/09/2026)', () => {
  it('en-têtes et pieds de page répétés, numéros de page : écartés', () => {
    const lines = [1, 2, 3, 4].flatMap((p) => [L(p, 780, 'RISE · Guide utilisateur'), L(p, 400, `Texte de la page ${p}`), L(p, 20, String(p))]);
    expect(stripRepeated(lines, 4).map((l) => l.text)).toEqual(['Texte de la page 1', 'Texte de la page 2', 'Texte de la page 3', 'Texte de la page 4']);
  });

  it('blocs : titres par taille de police (couverture ignorée), paragraphes, éléments de liste en retrait', () => {
    const lines = [
      L(1, 600, 'Titre du document', 28), L(1, 560, 'Chapeau de couverture.'),
      L(2, 760, '1. Chapitre', 20), L(2, 720, '1.1 Section', 14), L(2, 690, 'Premier paragraphe'), L(2, 675.6, 'sur deux lignes.'),
      L(2, 650, 'Élément un', 10, 66), L(2, 632, 'Élément deux', 10, 66), L(2, 600, '1.1.1 Détail', 11), L(2, 580, 'Texte du détail.'),
    ];
    const b = toBlocks(lines, 2);
    expect(b.map((x) => (x.kind === 'heading' ? `h${x.level} ${x.text}` : `${x.kind} ${x.text}`))).toEqual([
      'para Chapeau de couverture.', 'h1 1. Chapitre', 'h2 1.1 Section', 'para Premier paragraphe sur deux lignes.', 'item Élément un', 'item Élément deux', 'h3 1.1.1 Détail', 'para Texte du détail.',
    ]);
  });

  it('chunks : une section par chunk, chemin des titres, pages ; section longue coupée avec chevauchement ; reste court rattaché', () => {
    const long = Array.from({ length: 40 }, (_, i) => ({ kind: 'para' as const, text: sentence(i), page: 3 + Math.floor(i / 20), pageEnd: 3 + Math.floor(i / 20) }));
    const chunks = chunkBlocks([
      { kind: 'heading', level: 1, text: '1. Chapitre', page: 2 },
      { kind: 'heading', level: 2, text: '1.1 Courte', page: 2 },
      { kind: 'para', text: Array.from({ length: 5 }, (_, i) => sentence(i)).join(' '), page: 2, pageEnd: 2 },
      { kind: 'heading', level: 2, text: '1.2 Longue', page: 3 },
      ...long,
    ], 'Guide');
    expect(chunks[0]).toMatchObject({ path: ['Guide', '1. Chapitre', '1.1 Courte'], heading: '1.1 Courte', pageStart: 2, pageEnd: 2 });
    const parts = chunks.filter((c) => c.heading === '1.2 Longue');
    expect(parts.length).toBeGreaterThan(2);
    for (const c of parts) expect(c.tokens).toBeLessThanOrEqual(CHUNK_MAX_TOKENS);
    for (const c of parts.slice(0, -1)) expect(c.tokens).toBeLessThanOrEqual(CHUNK_TARGET_TOKENS + CHUNK_OVERLAP_TOKENS * 2);
    // Chevauchement : la dernière phrase d'un chunk ouvre le suivant.
    const lastOf = (s: string) => s.split('\n').pop()!;
    expect(parts[1].content.startsWith(lastOf(parts[0].content))).toBe(true);
    expect(parts[0].pageStart).toBe(3);
    expect(parts[parts.length - 1].pageEnd).toBe(4);
    expect(chunks.map((c) => c.position)).toEqual(chunks.map((_, i) => i));
    expect(embeddingText(chunks[0])).toBe(`Guide › 1. Chapitre › 1.1 Courte\n\n${chunks[0].content}`);
  });

  it('paragraphe géant : coupé entre phrases, jamais au-delà du maximum', () => {
    const text = Array.from({ length: 200 }, (_, i) => sentence(i)).join(' ');
    const chunks = chunkBlocks([{ kind: 'heading', level: 1, text: 'A', page: 1 }, { kind: 'para', text, page: 1, pageEnd: 1 }]);
    expect(chunks.every((c) => c.tokens <= CHUNK_MAX_TOKENS && /\.$/.test(c.content))).toBe(true);
    expect(estimateTokens(text)).toBeGreaterThan(CHUNK_MAX_TOKENS * 3);
  });

  it('PDF scanné : trop peu de texte, ou moins de la moitié des pages avec du texte', () => {
    expect(scannedReason([], 3)).toBe('scanned');
    expect(scannedReason([L(1, 400, 'x'.repeat(300))], 4)).toBe('scanned');
    expect(scannedReason([1, 2].map((p) => L(p, 400, 'y'.repeat(150))), 2)).toBeNull();
  });

  it('index HNSW : vector jusqu’à 2 000 dimensions, halfvec jusqu’à 4 000, aucun au-delà', () => {
    expect(hnswIndexSql(1536)).toMatch(/embedding::vector\(1536\)\) vector_cosine_ops\) WITH \(m = 16, ef_construction = 64\) WHERE dims = 1536$/);
    expect(hnswIndexSql(3072)).toMatch(/halfvec\(3072\)\) halfvec_cosine_ops/);
    expect(hnswIndexSql(4096)).toBeNull();
  });

  it('vecteurs de démonstration : déterministes, normalisés, proches pour des textes proches', () => {
    const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
    const a = hashEmbedding('règle de rattrapage des notifications', 256), b = hashEmbedding('rattrapage des notifications manquées', 256), c = hashEmbedding('inviter un utilisateur', 256);
    expect(hashEmbedding('règle de rattrapage des notifications', 256)).toEqual(a);
    expect(cos(a, a)).toBeCloseTo(1, 6);
    expect(cos(a, b)).toBeGreaterThan(cos(a, c));
  });

  it('guide réel de la Console : chapitres et sections reconnus, extraits de taille maîtrisée', async () => {
    const file = path.join(__dirname, '../../../docs/Guide utilisateur de la Console d\'administration RISE.pdf');
    const { pages, lines } = await readPdfLines(fs.readFileSync(file));
    expect(scannedReason(lines, pages)).toBeNull();
    const chunks = chunkBlocks(toBlocks(lines, pages));
    expect(chunks.length).toBeGreaterThan(60);
    expect(chunks.every((c) => c.tokens <= CHUNK_MAX_TOKENS)).toBe(true);
    const c = chunks.find((x) => x.heading === '3.18.4 Planification et règle de rattrapage')!;
    expect(c.path).toEqual(['Guide utilisateur', '3. Fonctionnalités, une par une', '3.18 Notifications envoyées aux utilisateurs', '3.18.4 Planification et règle de rattrapage']);
    expect(c.content).toContain('le lendemain du jour prévu, 23 h 59');
  });
});
