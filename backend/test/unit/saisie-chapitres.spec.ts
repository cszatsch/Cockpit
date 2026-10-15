import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Saisir sans Jev : chaque champ d'un formulaire doit appartenir à un chapitre, sinon il n'est jamais affiché
 * (15/10/2026 : « Remplace la décision » et « Texte de la décision » ajoutés sans chapitre, invisibles).
 */
const src = readFileSync(join(__dirname, '../../../frontends/Saisie sans Jev.dc.html'), 'utf8');
const code = /<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/.exec(src)![1];
const { SSJ_F, SSJ_CHAP } = new Function('DCLogic', code + '\nreturn { SSJ_F, SSJ_CHAP };')(class {});

describe('Saisir sans Jev : champs et chapitres', () => {
  it('chaque champ des objets à chapitres est rangé dans un chapitre, une seule fois', () => {
    for (const [kind, chaps] of Object.entries(SSJ_CHAP as Record<string, Array<[string, number[]]>>)) {
      const ranks = chaps.flatMap(([, r]) => r).sort((a, b) => a - b);
      expect({ kind, ranks }).toEqual({ kind, ranks: (SSJ_F[kind] as unknown[]).map((_, i) => i) });
    }
  });

  it('décision : « Remplace la décision » et « Texte de la décision » dans le chapitre Issue', () => {
    const issue = (SSJ_CHAP.decision as Array<[string, number[]]>).find(([l]) => l === 'Issue')![1].map((i) => SSJ_F.decision[i].k);
    expect(issue).toEqual(expect.arrayContaining(['dd', 'opt', 'decL', 'sup']));
  });
});
