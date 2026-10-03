import JSZip from 'jszip';
import zlib from 'zlib';

/**
 * Modèles de test du Format du rapport (sans fichier binaire versionné) : PowerPoint à la charte d'un client (masque
 * avec logo et thème, dispositions avec placeholders, 4 diapositives : couverture, intercalaire, page standard avec un
 * graphique d'exemple, clôture) et image PNG unie.
 */

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };

/** PNG uni (RVB). */
export function makePng(w: number, h: number, rgb = 'F7A41C'): Buffer {
  const px = Buffer.from(rgb, 'hex');
  const row = Buffer.concat([Buffer.from([0]), ...Array.from({ length: w }, () => px)]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))), chunk('IEND', Buffer.alloc(0))]);
}

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CT = 'application/vnd.openxmlformats-officedocument.presentationml';
const rels = (xs: Array<[string, string, string]>) => `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${xs.map(([id, t, target]) => `<Relationship Id="${id}" Type="${R}/${t}" Target="${target}"/>`).join('')}</Relationships>`;
const tree = (inner: string) => `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${inner}</p:spTree>`;
const xfrm = (x: number, y: number, w: number, h: number) => `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>`;
const ph = (id: number, type: string | null, idx: string | null, box: number[] | null, text: string | null, rpr = '<a:rPr lang="fr-FR"/>') =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${type ?? 'body'} ${id}"/><p:cNvSpPr/><p:nvPr><p:ph${type ? ` type="${type}"` : ''}${idx ? ` idx="${idx}"` : ''}/></p:nvPr></p:nvSpPr><p:spPr>${box ? xfrm(box[0], box[1], box[2], box[3]) : ''}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>${text === null ? '<a:p><a:endParaRPr lang="fr-FR"/></a:p>' : type === 'sldNum' ? `<a:p><a:fld id="{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}" type="slidenum">${rpr}<a:t>${text}</a:t></a:fld></a:p>` : `<a:p><a:r>${rpr}<a:t>${text}</a:t></a:r></a:p>`}</p:txBody></p:sp>`;
const rect = (id: number, name: string, box: number[], color: string) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(box[0], box[1], box[2], box[3])}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;
const pic = (id: number, rid: string, box: number[]) => `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Logo ${id}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(box[0], box[1], box[2], box[3])}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
const bg = (c: string) => `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${c}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`;
const chart = (id: number) => `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Graphique d'exemple"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="6000000" y="1600000"/><a:ext cx="5000000" cy="3000000"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblGrid><a:gridCol w="5000000"/></a:tblGrid><a:tr h="370840"><a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="fr-FR"/><a:t>Exemple</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;

export interface FixtureOpts { size?: { cx: number; cy: number }; font?: string; embedFont?: boolean; accent?: string; /** Pages « remplies » d'un exemple réel : zones de texte libres, sans placeholder (cas des modèles d'agence). */ filled?: boolean }

/**
 * PowerPoint à la charte « ACME » : thème (polices `font`, accent), masque avec logo en haut à droite et bandeau bas,
 * 4 dispositions (titre, section, contenu avec numéro de page et pied, vierge), 4 diapositives modèles.
 */
export async function makeFormatPptx(opts: FixtureOpts = {}): Promise<Buffer> {
  const size = opts.size ?? { cx: 12192000, cy: 6858000 };
  const font = opts.font ?? 'Montserrat', accent = opts.accent ?? '1D8F86';
  const W = size.cx, H = size.cy;
  const z = new JSZip();
  const slideCt = [1, 2, 3, 4].map((n) => `<Override PartName="/ppt/slides/slide${n}.xml" ContentType="${CT}.slide+xml"/>`).join('');
  const layoutCt = [1, 2, 3, 4].map((n) => `<Override PartName="/ppt/slideLayouts/slideLayout${n}.xml" ContentType="${CT}.slideLayout+xml"/>`).join('');
  z.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="fntdata" ContentType="application/x-fontdata"/><Override PartName="/ppt/presentation.xml" ContentType="${CT}.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${CT}.slideMaster+xml"/>${layoutCt}${slideCt}<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>`);
  z.file('_rels/.rels', rels([['rId1', 'officeDocument', 'ppt/presentation.xml']]));
  const fontLst = opts.embedFont ? `<p:embeddedFontLst><p:embeddedFont><p:font typeface="${font}"/><p:regular r:id="rId20"/></p:embeddedFont></p:embeddedFontLst>` : '';
  z.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8"?><p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${[1, 2, 3, 4].map((n) => `<p:sldId id="${255 + n}" r:id="rId${10 + n}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${W}" cy="${H}"/><p:notesSz cx="6858000" cy="9144000"/>${fontLst}</p:presentation>`);
  z.file('ppt/_rels/presentation.xml.rels', rels([['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ['rId2', 'theme', 'theme/theme1.xml'], ...[1, 2, 3, 4].map((n) => [`rId${10 + n}`, 'slide', `slides/slide${n}.xml`] as [string, string, string]), ...(opts.embedFont ? [['rId20', 'font', 'fonts/font1.fntdata'] as [string, string, string]] : [])]));
  if (opts.embedFont) z.file('ppt/fonts/font1.fntdata', Buffer.from('police incorporée de test'));
  z.file('ppt/theme/theme1.xml', `<?xml version="1.0" encoding="UTF-8"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="ACME"><a:themeElements><a:clrScheme name="ACME"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="10233A"/></a:dk2><a:lt2><a:srgbClr val="F3F7F6"/></a:lt2><a:accent1><a:srgbClr val="${accent}"/></a:accent1><a:accent2><a:srgbClr val="F7A41C"/></a:accent2><a:accent3><a:srgbClr val="43586A"/></a:accent3><a:accent4><a:srgbClr val="F0752B"/></a:accent4><a:accent5><a:srgbClr val="5C7280"/></a:accent5><a:accent6><a:srgbClr val="8A8F9C"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="ACME"><a:majorFont><a:latin typeface="${font}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="ACME"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`);
  z.file('ppt/media/logo.png', makePng(40, 16));
  // Masque : fond blanc, logo en haut à droite, placeholders de titre, de texte, de date, de pied et de numéro.
  const tB = [Math.round(W * 0.05), Math.round(H * 0.06), Math.round(W * 0.75), Math.round(H * 0.12)];
  const bB = [Math.round(W * 0.05), Math.round(H * 0.22), Math.round(W * 0.9), Math.round(H * 0.64)];
  const nB = [Math.round(W * 0.9), Math.round(H * 0.92), Math.round(W * 0.06), Math.round(H * 0.05)];
  const fB = [Math.round(W * 0.05), Math.round(H * 0.92), Math.round(W * 0.5), Math.round(H * 0.05)];
  z.file('ppt/slideMasters/slideMaster1.xml', `<?xml version="1.0" encoding="UTF-8"?><p:sldMaster ${NS}><p:cSld>${bg('FFFFFF')}${tree(pic(2, 'rId10', [W - 1600000, 300000, 1200000, 480000]) + ph(3, 'title', null, tB, 'Titre') + ph(4, 'body', '1', bB, 'Texte') + ph(5, 'sldNum', '12', nB, '‹N°›') + ph(6, 'ftr', '11', fB, ''))}</p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst>${[1, 2, 3, 4].map((n) => `<p:sldLayoutId id="${2147483648 + n}" r:id="rId${n}"/>`).join('')}</p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="3200" b="1"><a:solidFill><a:schemeClr val="tx2"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="1600"><a:solidFill><a:srgbClr val="43586A"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1000"><a:solidFill><a:srgbClr val="5C7280"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`);
  z.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', rels([...[1, 2, 3, 4].map((n) => [`rId${n}`, 'slideLayout', `../slideLayouts/slideLayout${n}.xml`] as [string, string, string]), ['rId9', 'theme', '../theme/theme1.xml'], ['rId10', 'image', '../media/logo.png']]));
  const layout = (n: number, type: string, name: string, inner: string, extra = '') => {
    z.file(`ppt/slideLayouts/slideLayout${n}.xml`, `<?xml version="1.0" encoding="UTF-8"?><p:sldLayout ${NS} type="${type}"${extra}><p:cSld name="${name}">${tree(inner)}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
    z.file(`ppt/slideLayouts/_rels/slideLayout${n}.xml.rels`, rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]));
  };
  layout(1, 'title', 'Titre', ph(2, 'ctrTitle', null, [Math.round(W * 0.08), Math.round(H * 0.34), Math.round(W * 0.84), Math.round(H * 0.16)], null) + ph(3, 'subTitle', '1', [Math.round(W * 0.08), Math.round(H * 0.52), Math.round(W * 0.84), Math.round(H * 0.1)], null));
  layout(2, 'secHead', 'Section', ph(2, 'title', null, [Math.round(W * 0.08), Math.round(H * 0.4), Math.round(W * 0.84), Math.round(H * 0.14)], null) + ph(3, 'body', '1', [Math.round(W * 0.08), Math.round(H * 0.56), Math.round(W * 0.84), Math.round(H * 0.08)], null));
  layout(3, 'obj', 'Contenu', ph(2, 'title', null, null, null) + ph(3, null, '1', null, null) + ph(4, 'sldNum', '12', null, '‹N°›') + ph(5, 'ftr', '11', null, 'ACME · Confidentiel'));
  layout(4, 'blank', 'Vierge', '', ' showMasterSp="0"');
  const slide = (n: number, layoutN: number, inner: string, background: string | null, extraRels: Array<[string, string, string]> = [], extra = '') => {
    z.file(`ppt/slides/slide${n}.xml`, `<?xml version="1.0" encoding="UTF-8"?><p:sld ${NS}${extra}><p:cSld>${background ? bg(background) : ''}${tree(inner)}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
    z.file(`ppt/slides/_rels/slide${n}.xml.rels`, rels([['rId1', 'slideLayout', `../slideLayouts/slideLayout${layoutN}.xml`], ...extraRels]));
  };
  const white = `<a:rPr lang="fr-FR" sz="4000" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:latin typeface="${font}"/></a:rPr>`;
  if (opts.filled) {
    const tb = (id: number, name: string, b: number[], text: string, sz: number, bold = false, color = '1E2124') => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(b[0], b[1], b[2], b[3])}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0"/><a:lstStyle/><a:p><a:r><a:rPr lang="fr-FR" sz="${sz * 100}" b="${bold ? 1 : 0}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="${font}"/></a:rPr><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
    const r = (x: number, y: number, w: number, h: number) => [Math.round(W * x), Math.round(H * y), Math.round(W * w), Math.round(H * h)];
    const card = (id: number, x: number, t: string) => `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${id}" name="Carte ${id}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="${Math.round(W * x)}" y="${Math.round(H * 0.3)}"/><a:ext cx="${Math.round(W * 0.28)}" cy="${Math.round(H * 0.4)}"/><a:chOff x="${Math.round(W * x)}" y="${Math.round(H * 0.3)}"/><a:chExt cx="${Math.round(W * 0.28)}" cy="${Math.round(H * 0.4)}"/></a:xfrm></p:grpSpPr>${rect(id * 10, 'Fond carte', r(x, 0.3, 0.28, 0.4), 'E6F3F2')}${tb(id * 10 + 1, 'Texte carte', r(x + 0.01, 0.32, 0.26, 0.3), t, 12)}</p:grpSp>`;
    slide(1, 4, tb(2, 'Text 0', r(0.75, 0.06, 0.2, 0.04), 'SEPTEMBRE 2026', 9) + rect(3, 'Bandeau', r(0, 0.45, 1, 0.55), '1E2124') + tb(4, 'Text 1', r(0.05, 0.52, 0.8, 0.1), 'Mission de pré-cadrage', 38, true, 'FFFFFF') + tb(5, 'Text 2', r(0.05, 0.65, 0.8, 0.05), 'Programme de digitalisation de la fonction Finance', 14, false, 'FFFFFF') + tb(6, 'Text 3', r(0.05, 0.84, 0.3, 0.04), 'Carrefour France — Direction financière', 11, false, 'FFFFFF'), 'FFFFFF', [], ' showMasterSp="0"');
    slide(2, 4, tb(2, 'Text 0', r(0.06, 0.4, 0.05, 0.05), '1', 18, true, '00A4E3') + tb(3, 'Text 1', r(0.06, 0.46, 0.8, 0.08), 'Nos convictions', 24, true, 'FFFFFF') + tb(4, 'Text 2', r(0.06, 0.55, 0.8, 0.06), 'Le programme tel que nous le lisons : quatre volets.', 11, false, 'FFFFFF'), '1E2124', [], ' showMasterSp="0"');
    slide(3, 4, rect(2, 'Barre latérale', r(0.94, 0, 0.06, 1), '1E2124') + tb(3, 'Text 5', r(0.05, 0.05, 0.3, 0.03), 'LE PROGRAMME', 8, true, '00A4E3') + tb(4, 'Text 6', r(0.05, 0.08, 0.85, 0.06), 'Une fonction Finance qui pilote plutôt qu’elle ne produit', 22, true) + tb(5, 'Text 7', r(0.05, 0.15, 0.85, 0.04), 'Reporting, cycle prévisionnel, franchise, contrôle interne', 10.5) + card(6, 0.05, '12,8 M€ budget du programme') + card(7, 0.35, '6 chantiers dont 2 transverses') + card(8, 0.65, '31.12.2027 fin des développements') + tb(9, 'Text 48', r(0.05, 0.93, 0.6, 0.03), '* Deux chantiers transverses ont également été validés', 8) + tb(10, 'Text 1', r(0.95, 0.04, 0.03, 0.04), '4', 10.5, true, 'FFFFFF'), 'FFFFFF', [], ' showMasterSp="0"');
    slide(4, 4, tb(2, 'Title 2', r(0.1, 0.4, 0.5, 0.15), 'Merci.', 54, true, 'FFFFFF'), '1E2124', [], ' showMasterSp="0"');
    return z.generateAsync({ type: 'nodebuffer' });
  }
  slide(1, 1, rect(4, 'Bandeau', [0, Math.round(H * 0.94), W, Math.round(H * 0.06)], 'F7A41C') + ph(2, 'ctrTitle', null, null, 'Titre du rapport', white) + ph(3, 'subTitle', '1', null, 'Sous-titre {{comite}}'), '10233A');
  slide(2, 2, ph(2, 'title', null, null, 'Titre de section', white) + ph(3, 'body', '1', null, null), accent);
  slide(3, 3, rect(6, 'Bandeau haut', [0, 0, W, Math.round(H * 0.03)], '10233A') + ph(2, 'title', null, null, 'Titre de la page') + ph(3, null, '1', null, 'Texte courant') + ph(4, 'sldNum', '12', null, '3') + ph(5, 'ftr', '11', null, 'ACME · Confidentiel') + chart(7), null);
  slide(4, 4, pic(2, 'rId2', [Math.round(W / 2 - 1200000), Math.round(H / 2 - 480000), 2400000, 960000]) + `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Merci"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(Math.round(W * 0.1), Math.round(H * 0.7), Math.round(W * 0.8), 600000)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r>${white}<a:t>Merci</a:t></a:r></a:p></p:txBody></p:sp>`, '10233A', [['rId2', 'image', '../media/logo.png']]);
  return z.generateAsync({ type: 'nodebuffer' });
}

/**
 * Contrôle d'intégrité d'un paquet PowerPoint (ce que PowerPoint vérifie à l'ouverture) : chaque relation interne
 * pointe vers une partie existante, chaque partie a un type de contenu, chaque diapositive de la liste existe, les
 * identifiants de diapositives, de masques et de dispositions sont uniques.
 */
export async function pptxIntegrity(buf: Buffer): Promise<string[]> {
  const z = await JSZip.loadAsync(buf);
  const problems: string[] = [];
  const ct = await z.file('[Content_Types].xml')!.async('string');
  const files = Object.keys(z.files).filter((f) => !z.files[f].dir);
  for (const f of files) {
    if (f === '[Content_Types].xml' || f.endsWith('.rels')) continue;
    const ext = (f.split('.').pop() ?? '').toLowerCase();
    if (!ct.includes(`PartName="/${f}"`) && !new RegExp(`Extension="${ext}"`, 'i').test(ct)) problems.push(`type de contenu manquant : ${f}`);
  }
  for (const m of ct.matchAll(/PartName="\/([^"]+)"/g)) if (!z.file(m[1])) problems.push(`type de contenu sans partie : ${m[1]}`);
  for (const r of files.filter((f) => f.endsWith('.rels'))) {
    const dir = r.replace(/_rels\/[^/]*\.rels$/, '');
    const xml = await z.file(r)!.async('string');
    for (const m of xml.matchAll(/<Relationship\b([^>]*)\/>/g)) {
      if (/TargetMode="External"/.test(m[1])) continue;
      const target = /Target="([^"]+)"/.exec(m[1])![1];
      const parts = (dir + target).split('/');
      const out: string[] = [];
      for (const p of parts) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); }
      const abs = target.startsWith('/') ? target.slice(1) : out.join('/');
      if (!z.file(abs)) problems.push(`relation cassée dans ${r} : ${target}`);
    }
  }
  const pres = await z.file('ppt/presentation.xml')!.async('string');
  const ids = [...pres.matchAll(/<p:sldId\b[^>]*\bid="(\d+)"/g)].map((m) => m[1]);
  if (new Set(ids).size !== ids.length) problems.push('identifiants de diapositives en double');
  const mlIds = [...pres.matchAll(/<p:sldMasterId\b[^>]*\bid="(\d+)"/g)].map((m) => m[1]);
  for (const f of files.filter((x) => /^ppt\/slideMasters\/[^/]+\.xml$/.test(x))) mlIds.push(...[...(await z.file(f)!.async('string')).matchAll(/<p:sldLayoutId\b[^>]*\bid="(\d+)"/g)].map((m) => m[1]));
  if (new Set(mlIds).size !== mlIds.length) problems.push('identifiants de masques / dispositions en double');
  if (mlIds.some((x) => Number(x) < 2147483648)) problems.push('identifiant de masque ou de disposition < 2147483648');
  return problems;
}
