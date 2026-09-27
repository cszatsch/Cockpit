import fs from 'fs';
import path from 'path';
import vm from 'vm';

/**
 * Charge les modules de données du jeu de démonstration (`rise-data.js`, `planning-data.js`).
 * Ces fichiers ne contiennent que des déclarations `export const X = …` : elles sont évaluées dans
 * un contexte isolé (sans accès au processus), ce qui évite de dépendre du chargeur ES de Node/Jest.
 */
export function frontendDir(): string {
  return path.resolve(process.env.SEED_DATA_DIR || path.join(__dirname, '../../../frontends'));
}

export function loadDataModule(file: string): Record<string, any> {
  const src = fs.readFileSync(file, 'utf8').replace(/^export\s+const\s+(\w+)\s*=/gm, 'exports.$1 =');
  const sandbox = { exports: {} as Record<string, any> };
  vm.runInNewContext(src, sandbox, { filename: file, timeout: 5000 });
  return JSON.parse(JSON.stringify(sandbox.exports));
}

export async function loadDemo(): Promise<{ rise: any; plan: any }> {
  const dir = frontendDir();
  return {
    rise: loadDataModule(path.join(dir, 'rise-data.js')),
    plan: loadDataModule(path.join(dir, 'planning-data.js')),
  };
}
