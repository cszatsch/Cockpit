import JSZip from 'jszip';
import { analyzePptx } from '../../src/core/report-format-read';
import { applyRoles, topLevelShapes } from '../../src/core/report-format-write';
import { capacity, composeTemplate, fillTemplate, visualCheck } from '../../src/core/report-template';
import { exampleArea, PageKind, roleErrors, suggestRoles } from '../../src/domain/report-format';
import { sectionsOf } from '../../src/domain/report-components';
import { parseRoles, parseWriting, retryPrompt, rolesPrompt, WritingFacts } from '../../src/domain/report-writing';
import { makeFormatPptx, pptxIntegrity } from '../format-fixture';

/**
 * Fidélité au design des pages modèles « remplies » (03/10/2026) : rôle des formes (règles et IA), application des
 * rôles, zone de contenu libérée, contrôle visuel ; rédaction des titres-messages et de la synthèse (contrôles).
 */
describe('Pages modèles remplies — rôles des formes', () => {
  const load = async () => analyzePptx(await makeFormatPptx({ filled: true }));
  const named = (a: any, n: number, roles: Record<string, string>) => Object.fromEntries(a.slides[n - 1].shapes.map((s: any) => [s.name, roles[s.id]]));

  it('inventaire : formes de premier niveau (groupes entiers), texte, corps, gras, police', async () => {
    const a = await load();
    const std = a.slides[2].shapes!;
    expect(std.map((s) => [s.name, s.kind])).toEqual([['Barre latérale', 'shape'], ['Text 5', 'text'], ['Text 6', 'text'], ['Text 7', 'text'], ['Carte 6', 'group'], ['Carte 7', 'group'], ['Carte 8', 'group'], ['Text 48', 'text'], ['Text 1', 'text']]);
    expect(std[2]).toMatchObject({ text: 'Une fonction Finance qui pilote plutôt qu’elle ne produit', size: 22, bold: true, font: 'Montserrat', color: '1E2124' });
    expect(std[4].text).toBe('12,8 M€ budget du programme');
  });

  it('proposition par règles : titre, sous-titre, section, numéro de page, date, période, bas de page, exemple', async () => {
    const a = await load();
    const r = (n: number, k: PageKind) => named(a, n, suggestRoles(k, a.slides[n - 1].shapes!, a.size));
    expect(r(1, 'cover')).toEqual({ 'Text 0': 'date', Bandeau: 'fixed', 'Text 1': 'title', 'Text 2': 'subtitle', 'Text 3': 'fixed' });
    expect(r(2, 'divider')).toEqual({ 'Text 0': 'sectionNumber', 'Text 1': 'title', 'Text 2': 'subtitle' });
    expect(r(3, 'standard')).toEqual({ 'Barre latérale': 'fixed', 'Text 5': 'section', 'Text 6': 'title', 'Text 7': 'subtitle', 'Carte 6': 'example', 'Carte 7': 'example', 'Carte 8': 'example', 'Text 48': 'footer', 'Text 1': 'pageNumber' });
    expect(r(4, 'closing')).toEqual({ 'Title 2': 'fixed' });
  });

  it('contrôle des rôles et zone de contenu libérée par l’exemple', async () => {
    const a = await load();
    const std = a.slides[2].shapes!, roles = suggestRoles('standard', std, a.size);
    expect(roleErrors('standard', std, roles)).toBeNull();
    const noTitle = Object.fromEntries(Object.entries(roles).map(([k, v]) => [k, v === 'title' ? 'fixed' : v]));
    expect(roleErrors('standard', std, noTitle as any)).toBe('Page standard : désignez la zone de titre (la forme qui recevra le titre)');
    expect(roleErrors('standard', std, { ...roles, [std[4].id]: 'title' } as any)).toBe('Page standard : seule une zone de texte peut recevoir un texte (« Carte 6 »)');
    expect(roleErrors('closing', a.slides[3].shapes!, { [a.slides[3].shapes![0].id]: 'fixed' })).toBeNull();
    const area = exampleArea(std, roles)!;
    expect(area).toEqual({ x: Math.round(a.size.cx * 0.05), y: Math.round(a.size.cy * 0.3), w: Math.round(a.size.cx * 0.88), h: Math.round(a.size.cy * 0.4) });
  });

  it('application : exemple retiré (groupes compris), texte réécrit dans la forme avec sa mise en forme, zone nommée', () => {
    const sp = (id: number, name: string, t: string) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="fr-FR" sz="2200" b="1"/><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp>`;
    const grp = `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="5" name="G"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:grpSp><p:nvGrpSpPr><p:cNvPr id="6" name="G2"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${sp(7, 'in', 'dedans')}</p:grpSp></p:grpSp>`;
    const xml = `<p:sld><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${sp(2, 'T', 'Ancien titre')}${grp}${sp(3, 'D', 'SEPTEMBRE 2026')}</p:spTree></p:cSld></p:sld>`;
    expect(topLevelShapes(xml).map((s) => [s.tag, s.id])).toEqual([['p:nvGrpSpPr', null], ['p:grpSpPr', null], ['p:sp', '2'], ['p:grpSp', '5'], ['p:sp', '3']].filter(([t]) => t !== 'p:nvGrpSpPr' && t !== 'p:grpSpPr'));
    const r = applyRoles(xml, { 2: 'title', 5: 'example', 3: 'date' }, { values: { title: 'Le Go-Live tient', date: '3 oct. 2026' }, names: { title: 'rise:c01.title', date: 'rise:report.date' } });
    expect([...r.done]).toEqual(['title', 'date']);
    expect(r.xml).not.toContain('dedans');
    expect(r.xml).toContain('<p:cNvPr id="2" name="rise:c01.title"/>');
    expect(r.xml).toContain('<a:rPr lang="fr-FR" sz="2200" b="1"/><a:t>Le Go-Live tient</a:t>');
    expect(r.xml).toContain('<a:t>3 oct. 2026</a:t>');
  });

  it('template : exemple retiré, titres et dates dans les formes du modèle, contenu posé dans la place libérée, aucun recouvrement', async () => {
    const buf = await makeFormatPptx({ filled: true });
    const a = await analyzePptx(buf);
    const src = (n: number) => ({ fileId: 'F', kind: 'PPTX' as const, buf, analysis: a, slide: n });
    const { buf: tpl, manifest } = await composeTemplate({ cover: src(1), divider: src(2), standard: src(3), closing: src(4) }, { title: 'Support COPIL', sections: sectionsOf([{ id: 'actions', scope: 'PROJECT' }]), tokens: { titre: 'Support COPIL', date: '3 oct. 2026', projet: 'RISE', client: 'AMC Corp', comite: 'COPIL' } });
    expect(await pptxIntegrity(tpl)).toEqual([]);
    const z = await JSZip.loadAsync(tpl);
    const std = await z.file(manifest.pages[2].slide)!.async('string');
    expect(std).not.toContain('12,8 M€');
    expect(std).toContain('<p:cNvPr id="4" name="rise:c01.title"/>'); // forme de titre du modèle, réutilisée
    expect(std).toContain('<p:cNvPr id="5" name="rise:c01.caption"/>'); // sous-titre du modèle = légende du composant
    expect(std).toContain('<a:t>Actions</a:t>'); // nom de la section dans la mention du modèle
    expect(std).toContain('* Deux chantiers transverses'); // bas de page gardé
    const cover = await z.file(manifest.pages[0].slide)!.async('string');
    expect(cover).toContain('<a:t>Support COPIL</a:t>');
    expect(cover).not.toContain('Mission de pré-cadrage');
    expect(cover).toContain('name="rise:report.date"');
    const tbl = manifest.fields.find((f) => f.id === 'c01.table')!;
    expect(tbl.area!.y).toBeGreaterThanOrEqual(Math.round(a.size.cy * 0.3));
    expect(manifest.fields.find((f) => f.id === 'c01.title')!.maxChars).toBeGreaterThan(30);
    const out = await fillTemplate(tpl, manifest, { text: { 'c01.title': ['Trois risques critiques'], 'c01.caption': ['Projet entier'], 'report.subtitle': ['COPIL'], 'report.date': ['3 oct. 2026'] }, tables: { 'c01.table': [['R01', 'Données', '25', 'Karim', 'Ouvert']] }, charts: {} });
    expect(await visualCheck(out, manifest)).toEqual([]);
  });

  it('contrôle visuel : recouvrement d’un texte du modèle, texte trop long pour sa zone', async () => {
    const { buf, manifest } = await composeTemplate(null, { title: 'T', sections: sectionsOf([{ id: 'actions', scope: 'PROJECT' }]), tokens: { date: '3 oct. 2026' } });
    const f = manifest.fields.find((x) => x.id === 'c01.table')!;
    const z = await JSZip.loadAsync(buf);
    const xml = await z.file(f.slide)!.async('string');
    const intrus = `<p:sp><p:nvSpPr><p:cNvPr id="999" name="Note"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${f.area!.x}" y="${f.area!.y}"/><a:ext cx="${f.area!.w}" cy="${f.area!.h}"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="fr-FR"/><a:t>Note du modèle</a:t></a:r></a:p></p:txBody></p:sp>`;
    z.file(f.slide, xml.replace('</p:spTree>', `${intrus}</p:spTree>`));
    const filled = await fillTemplate(await z.generateAsync({ type: 'nodebuffer' }), manifest, { text: { 'c01.title': ['x'.repeat(600)] }, tables: {}, charts: {} });
    const w = (await visualCheck(filled, manifest)).map((x) => x.message);
    expect(w).toEqual(expect.arrayContaining([expect.stringMatching(/^Page 3 : « c01\.table » recouvre le texte du modèle « Note du modèle »/), expect.stringMatching(/^Page 3 : le texte de « c01\.title » dépasse probablement de sa zone/)]));
    expect(capacity('<p:sp><a:ext cx="6350000" cy="457200"/><a:rPr sz="2000"/></p:sp>')).toBe(50);
  });
});

describe('IA de la génération des rapports — contrôles des réponses', () => {
  it('rôles proposés par l’IA : rôles connus gardés, inconnus remplacés par la règle, sans titre → refus', async () => {
    const a = await analyzePptx(await makeFormatPptx({ filled: true }));
    const shapes = a.slides[0].shapes!, rules = suggestRoles('cover', shapes, a.size);
    expect(rolesPrompt('cover', shapes, a.size, rules)).toContain('"texte": "Mission de pré-cadrage"');
    const id = (n: string) => shapes.find((s) => s.name === n)!.id;
    const ok = parseRoles(`Voici : {"roles": {"${id('Text 1')}": "title", "${id('Text 3')}": "client", "${id('Bandeau')}": "bidon"}}`, 'cover', shapes, rules)!;
    expect([ok[id('Text 1')], ok[id('Text 3')], ok[id('Bandeau')], ok[id('Text 0')]]).toEqual(['title', 'client', 'fixed', 'date']);
    expect(parseRoles(`{"roles": {"${id('Text 1')}": "example"}}`, 'cover', shapes, Object.fromEntries(shapes.map((s) => [s.id, 'fixed'])))).toBeNull();
    expect(parseRoles('pas de JSON', 'cover', shapes, rules)).toBeNull();
  });

  it('rédaction : titres et synthèse acceptés ; trop long, nombre inventé ou absent → refusés avec le motif', () => {
    const f: WritingFacts = { report: { title: 'COPIL', committee: 'COPIL', project: 'RISE', date: '3 oct. 2026' }, synthesis: 'c01', components: [
      { key: 'c01', label: 'Synthèse', caption: 'Projet entier', kpis: [{ label: 'Risques critiques', value: '3' }], titreMax: 45 },
      { key: 'c02', label: 'Risques', caption: 'Projet entier', table: { columns: ['Code', 'Criticité'], rows: [['R01', '25']], total: 1 } },
    ] };
    const good = parseWriting('{"titres": {"c01": "3 risques critiques pèsent sur le go-live.", "c02": "R01 en tête à 25"}, "synthese": ["Le projet compte 3 risques critiques, dont R01 à 25."]}', f);
    expect(good).toEqual({ titles: { c01: '3 risques critiques pèsent sur le go-live', c02: 'R01 en tête à 25' }, synthesis: ['Le projet compte 3 risques critiques, dont R01 à 25.'], rejected: [] });
    const bad = parseWriting('{"titres": {"c01": "Un titre beaucoup trop long pour tenir dans la zone prévue", "c02": "10 risques à surveiller"}, "synthese": ["Il reste 12 actions."]}', f);
    expect(bad.titles).toEqual({});
    expect(bad.synthesis).toBeNull();
    expect(bad.rejected).toEqual(['c01 : titre trop long (58 caractères pour 45) « Un titre beaucoup trop long pour tenir dans la zone prévue »', 'c02 : nombre absent des données (10) dans « 10 risques à surveiller »', 'synthèse : nombre absent des données (12) dans « Il reste 12 actions. »']);
    expect(retryPrompt(f, bad.rejected)).toContain('- c02 : nombre absent des données (10)');
    expect(parseWriting('réponse sans JSON', f).rejected).toEqual(expect.arrayContaining(['c01 : titre absent', 'synthèse absente']));
  });
});
