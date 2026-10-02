import JSZip from 'jszip';
import {
  builtInFormat, elementRole, estimatedZones, FormatAnalysis, formatErrors, isStandardFont, pageSummary, pageWarnings, previewSvg, ratioLabel, sameSize, sizeLabel, SlideAnalysis,
} from '../../src/domain/report-format';
import { colorOf, parseXml, relsPath, resolvePath } from '../../src/core/ooxml';
import { analyzeImage, analyzePptx, contrastOn, formatKindOf, pdfFont } from '../../src/core/report-format-read';
import { makeFormatPptx, makePng } from '../format-fixture';

/** Format du rapport (étape B de « Créer un template », 02/10/2026) : règles, lecture et génération sans base. */
describe('Format du rapport — règles', () => {
  const size = { cx: 12192000, cy: 6858000 };

  it('dimensions : format nommé, libellé en cm, comparaison à 0,5 % près', () => {
    expect(ratioLabel(12192000, 6858000)).toBe('16:9');
    expect(ratioLabel(9144000, 6858000)).toBe('4:3');
    expect(ratioLabel(10000, 3000)).toBe('personnalisé');
    expect(sizeLabel(size)).toBe('16:9 · 33,87 × 19,05 cm');
    expect(sameSize(size, { cx: 12192000, cy: 6858000 })).toBe(true);
    expect(sameSize(size, { cx: 9144000, cy: 6858000 })).toBe(false);
  });

  it('rôle des éléments fixes : logo près d’un bord, bandeau, filigrane, fond', () => {
    expect(elementRole('image', { x: 11000000, y: 200000, w: 900000, h: 400000 }, size)).toBe('logo');
    expect(elementRole('image', { x: 4000000, y: 2500000, w: 1500000, h: 1000000 }, size)).toBe('image');
    expect(elementRole('shape', { x: 0, y: 6400000, w: 12192000, h: 400000 }, size)).toBe('band');
    expect(elementRole('image', { x: 2000000, y: 1000000, w: 6000000, h: 4000000 }, size, 0.2)).toBe('watermark');
    expect(elementRole('image', { x: 0, y: 0, w: 12192000, h: 6858000 }, size)).toBe('background');
  });

  it('polices : standard d’Office reconnue, police introuvable signalée sauf si incorporée', () => {
    expect(isStandardFont('calibri')).toBe(true);
    expect(isStandardFont('Montserrat')).toBe(false);
    const s = { ...builtInFormat().pages.standard, fonts: ['Montserrat', 'Calibri'], warnings: [] } as SlideAnalysis;
    s.zones = s.zones.filter((z) => z.role !== 'pageNumber');
    const w = pageWarnings('standard', s, 'PPTX', []);
    expect(w.some((x) => x.startsWith('Police introuvable : « Montserrat »'))).toBe(true);
    expect(w.some((x) => x.startsWith('Aucune zone de pagination'))).toBe(true);
    expect(pageWarnings('standard', s, 'PPTX', ['Montserrat']).some((x) => x.startsWith('Police introuvable'))).toBe(false);
    expect(pageWarnings('closing', { ...s, zones: [] }, 'PPTX', ['Montserrat'])).toEqual([]); // clôture : ni titre ni pagination attendus
    expect(pageWarnings('cover', s, 'IMAGE', ['Montserrat'])[0]).toMatch(/^Image : la page sert de fond plein écran/);
  });

  it('contrôles du format complet : pages manquantes, diapositive absente, dimensions différentes', () => {
    const a = (cx: number, n = 4): FormatAnalysis => ({ ...builtInFormat().analysis, kind: 'PPTX', size: { cx, cy: 6858000 }, slides: builtInFormat().analysis.slides.slice(0, n) });
    const files = new Map([['A', { name: 'a.pptx', analysis: a(12192000), error: null }], ['B', { name: 'b.pptx', analysis: a(9144000), error: null }]]);
    expect(formatErrors({ cover: { fileId: 'A', slide: 1 } }, files)).toEqual({ divider: 'Page intercalaire manquante', standard: 'Page standard manquante', closing: 'Page de clôture manquante' });
    expect(formatErrors({ cover: { fileId: 'A', slide: 9 }, divider: { fileId: 'A', slide: 2 }, standard: { fileId: 'A', slide: 3 }, closing: { fileId: 'X', slide: 1 } }, files)).toEqual({
      cover: 'Page de couverture : la diapositive 9 n\'existe pas dans a.pptx (4)', closing: 'Page de clôture : fichier introuvable, chargez-le de nouveau',
    });
    const e = formatErrors({ cover: { fileId: 'A', slide: 1 }, divider: { fileId: 'A', slide: 2 }, standard: { fileId: 'A', slide: 3 }, closing: { fileId: 'B', slide: 4 } }, files);
    expect(Object.keys(e)).toEqual(['closing']);
    expect(e.closing).toMatch(/dimensions 4:3 · 25,40 × 19,05 cm différentes de la page de couverture \(16:9/);
    expect(formatErrors({ cover: { fileId: 'A', slide: 1 }, divider: { fileId: 'A', slide: 2 }, standard: { fileId: 'A', slide: 3 }, closing: { fileId: 'A', slide: 4 } }, files)).toEqual({});
  });

  it('zones estimées (image) : titre centré sur la couverture, titre et texte sur la page standard', () => {
    expect(estimatedZones('cover', size).map((z) => z.role)).toEqual(['title', 'subtitle', 'date']);
    expect(estimatedZones('standard', size).map((z) => z.role)).toEqual(['title', 'body', 'pageNumber']);
    expect(estimatedZones('closing', size)).toEqual([]);
  });

  it('couleurs DrawingML : schéma du thème, correspondance du masque, luminosité, opacité', () => {
    const ctx = { scheme: { dk1: '000000', lt1: 'FFFFFF', accent1: '1D8F86', dk2: '10233A' }, map: { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2' } };
    const c = (xml: string) => colorOf(parseXml(`<a:solidFill xmlns:a="x">${xml}</a:solidFill>`), ctx);
    expect(c('<a:srgbClr val="f7a41c"/>')).toEqual({ color: 'F7A41C' });
    expect(c('<a:schemeClr val="tx2"/>')).toEqual({ color: '10233A' });
    expect(c('<a:schemeClr val="bg1"><a:lumMod val="50000"/></a:schemeClr>')).toEqual({ color: '808080' });
    expect(c('<a:srgbClr val="000000"><a:alpha val="40000"/></a:srgbClr>')).toEqual({ color: '000000', alpha: 0.4 });
    expect(c('<a:sysClr val="window" lastClr="FFFFFF"/>')).toEqual({ color: 'FFFFFF' });
    expect(contrastOn('10233A')).toBe('FFFFFF');
    expect(contrastOn('F3F7F6')).toBe('1F2124');
  });

  it('chemins du paquet et noms de police PDF', () => {
    expect(resolvePath('ppt/slides/slide1.xml', '../media/image1.png')).toBe('ppt/media/image1.png');
    expect(relsPath('ppt/slides/slide1.xml')).toBe('ppt/slides/_rels/slide1.xml.rels');
    expect(pdfFont('ABCDEF+Montserrat-Bold')).toEqual({ font: 'Montserrat', bold: true, italic: false });
    expect(pdfFont('ArialMT')).toEqual({ font: 'Arial', bold: false, italic: false });
  });
});

describe('Format du rapport — lecture des fichiers', () => {
  it('type réel contrôlé : extension refusée, .ppt, contenu ne correspondant pas, fichier protégé, vide', () => {
    const png = makePng(1280, 720);
    expect(formatKindOf(png, 'fond.png')).toBe('IMAGE');
    expect(() => formatKindOf(png, 'note.docx')).toThrow('Format non pris en charge');
    expect(() => formatKindOf(png, 'ancien.ppt')).toThrow('Ancien format PowerPoint (.ppt)');
    expect(() => formatKindOf(png, 'modele.pptx')).toThrow("Le contenu ne correspond pas à l'extension .pptx (fichier PNG)");
    expect(() => formatKindOf(Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64)]), 'modele.pptx')).toThrow('protégé par un mot de passe');
    expect(() => formatKindOf(Buffer.alloc(0), 'modele.pptx')).toThrow('Fichier vide');
  });

  it('image : dimensions et format déduits, image trop petite refusée', () => {
    const a = analyzeImage(makePng(1280, 960));
    expect(a).toMatchObject({ kind: 'IMAGE', size: { cx: 9144000, cy: 6858000 } });
    expect(ratioLabel(a.size.cx, a.size.cy)).toBe('4:3');
    expect(() => analyzeImage(makePng(400, 225))).toThrow('Image trop petite (400 px de large)');
  });

  it('PowerPoint : fond, éléments fixes du masque et de la diapositive, zones, typographie, palette, marges', async () => {
    const a = await analyzePptx(await makeFormatPptx());
    expect(a).toMatchObject({ kind: 'PPTX', size: { cx: 12192000, cy: 6858000 }, theme: { major: 'Montserrat', minor: 'Calibri', colors: expect.objectContaining({ accent1: '1D8F86' }) } });
    const [cover, divider, std, closing] = a.slides;
    expect(cover).toMatchObject({ index: 1, label: 'Titre du rapport', background: { type: 'solid', color: '10233A' } });
    expect(cover.elements.map((e) => [e.role, e.origin])).toEqual([['logo', 'master'], ['band', 'slide']]);
    expect(cover.zones.map((z) => z.role)).toEqual(['title', 'subtitle']);
    expect(cover.typography.title).toEqual({ font: 'Montserrat', size: 40, bold: true, italic: false, color: 'FFFFFF' });
    expect(divider.background).toEqual({ type: 'solid', color: '1D8F86' });
    // Page standard : position héritée de la disposition puis du masque, style du masque (txStyles).
    expect(std.zones.map((z) => z.role)).toEqual(['title', 'body', 'pageNumber', 'footer']);
    expect(std.zones[0].box).toEqual({ x: 609600, y: 411480, w: 9144000, h: 822960 });
    expect(std.typography.title).toEqual({ font: 'Montserrat', size: 32, bold: true, italic: false, color: '10233A' });
    expect(std.typography.body).toMatchObject({ font: 'Calibri', size: 16, color: '43586A' });
    expect(std.elements.map((e) => e.role)).toEqual(['logo', 'band', 'table']);
    expect(std.margins).toMatchObject({ left: 609600, top: 411480 });
    expect(std.palette.slice(0, 3)).toEqual(['FFFFFF', '10233A', '43586A']);
    // Clôture : disposition vierge sans les éléments du masque.
    expect(closing.elements.map((e) => e.role)).toEqual(['image', 'text']);
    expect(pageSummary(a, cover)).toMatchObject({ format: '16:9 · 33,87 × 19,05 cm', background: 'uni #10233A', elements: ['1 logo', '1 bandeau'], zones: ['titre', 'sous-titre'] });
    expect(pageWarnings('cover', cover, 'PPTX', a.embeddedFonts)).toEqual([expect.stringMatching(/^Police introuvable : « Montserrat »/)]);
    const embedded = await analyzePptx(await makeFormatPptx({ embedFont: true }));
    expect(embedded.embeddedFonts).toEqual(['Montserrat']);
    expect(pageWarnings('cover', embedded.slides[0], 'PPTX', embedded.embeddedFonts)).toEqual([]);
  });

  it('aperçu : fond, logo en image intégrée, zones de contenu en pointillés', async () => {
    const a = await analyzePptx(await makeFormatPptx());
    const svg = previewSvg(a, a.slides[0], (p) => (p === 'ppt/media/logo.png' ? 'data:image/png;base64,AAA' : null));
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 1280 720"/);
    expect(svg).toContain('fill="#10233A"');
    expect(svg).toContain('<image href="data:image/png;base64,AAA"');
    expect(svg).toContain('stroke-dasharray="6 4"');
    expect(svg).toContain('>Titre du rapport</tspan>');
  });

  it('PowerPoint illisible ou sans diapositive : message clair', async () => {
    await expect(analyzePptx(Buffer.from('PK\u0003\u0004 pas un zip'))).rejects.toThrow('Fichier PowerPoint illisible ou endommagé');
    const z = new JSZip();
    z.file('ppt/presentation.xml', '<p:presentation xmlns:p="p"><p:sldIdLst/></p:presentation>');
    await expect(analyzePptx(await z.generateAsync({ type: 'nodebuffer' }))).rejects.toThrow('aucune diapositive');
  });
});
