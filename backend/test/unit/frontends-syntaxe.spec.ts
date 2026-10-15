import { execFileSync } from 'child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Syntaxe des frontends (12/10/2026) : une erreur de syntaxe dans un client (`admin-api.js`) empêchait son chargement ;
 * la Console restait alors sur ses données de démonstration (compte « Julien Morel »), sans message. Chaque client et le
 * script de chaque écran `.dc.html` sont contrôlés par `node --check`.
 */
describe('Frontends : syntaxe des clients et des écrans', () => {
  const dir = join(__dirname, '../../../frontends');
  const tmp = mkdtempSync(join(tmpdir(), 'rise-syntaxe-'));
  // Nettoyage best effort : sous Windows, l'antivirus verrouille parfois le dossier (EPERM) ; ce n'est pas un échec du test.
  afterAll(() => { try { rmSync(tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); } catch { /* dossier temporaire laissé au système */ } });
  const check = (name: string, code: string) => {
    const f = join(tmp, name.replace(/[^A-Za-z0-9.-]/g, '_') + '.mjs');
    writeFileSync(f, code);
    try {
      execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    } catch (e: any) {
      throw new Error(`${name} : ${String(e.stderr || e.message).split('\n').slice(0, 6).join('\n')}`);
    }
  };

  it.each(readdirSync(dir).filter((f) => f.endsWith('.js')))('%s', (f) => check(f, readFileSync(join(dir, f), 'utf8')));

  it('scripts des écrans .dc.html', () => {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.dc.html'))) {
      const s = readFileSync(join(dir, f), 'utf8'), i = s.indexOf('data-dc-script');
      if (i < 0) continue;
      const j = s.indexOf('>', i) + 1;
      check(f, s.slice(j, s.indexOf('</script>', j)));
    }
  });
});
