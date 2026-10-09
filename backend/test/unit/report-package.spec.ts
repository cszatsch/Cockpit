import JSZip from 'jszip';
import { Draw } from '../../src/core/report-draw';
import { pruneOrphanMedia } from '../../src/core/ooxml';
import { designTokens } from '../../src/domain/report-design';

// Fichier PowerPoint « à réparer » (09/10/2026) : zone de texte sans paragraphe et image orpheline d'une forme « exemple ».
describe('Rapports — paquet PowerPoint valide', () => {
  it('une zone de texte dessinée sans paragraphe en reçoit un vide (PowerPoint exige au moins un <a:p>)', () => {
    const d = new Draw(designTokens({ primary: '10233A', secondary: '1D8F86', text: '10233A', font: 'Arial', size: 12 }));
    const xml = d.text({ x: 0, y: 0, w: 100, h: 100 }, []);
    expect(xml).toMatch(/<p:txBody>[\s\S]*<a:p>[\s\S]*<\/a:p><\/p:txBody>/);
  });

  it('retire les médias qu’aucune relation ne vise, garde les autres', async () => {
    const z = new JSZip();
    z.file('ppt/slides/slide1.xml', '<p:sld/>');
    z.file('ppt/slides/_rels/slide1.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://x/image" Target="../media/image1.png"/><Relationship Id="rId2" Type="http://x/hyperlink" Target="https://exemple.fr/a.png" TargetMode="External"/></Relationships>');
    z.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://x/image" Target="/ppt/media/logo.emf"/></Relationships>');
    z.file('ppt/media/image1.png', 'a');
    z.file('ppt/media/logo.emf', 'b');
    z.file('ppt/media/image2.png', 'c');
    z.file('ppt/embeddings/old.xlsx', 'd');
    expect((await pruneOrphanMedia(z)).sort()).toEqual(['ppt/embeddings/old.xlsx', 'ppt/media/image2.png']);
    expect(Object.keys(z.files).filter((p) => p.startsWith('ppt/media/') && !z.files[p].dir).sort()).toEqual(['ppt/media/image1.png', 'ppt/media/logo.emf']);
  });
});
