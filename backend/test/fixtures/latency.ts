import { addDays } from '../../src/domain/dates';
import { parisTime } from '../../src/domain/notification-rules';

/**
 * Jeu de mesures des temps de traitement, calqué sur la démonstration de l'écran (TEMPS § 4) : 6 catégories, étapes et
 * modèles de la maquette (identifiants du jeu d'essai `seedDemoAi`), prompts chaque jour de `days` jours se terminant
 * `yesterday`. Base de connaissance : Reclassement en « Délai dépassé (5 s) » un jour sur trois ; Génération du guide
 * du Cockpit : un prompt sur dix servi par le secours (Mistral Large 2) après l'échec du principal.
 */
export interface FixtureRow {
  requestId: string; category: string; step: string; model: string; role: string;
  startedAt: Date; endedAt: Date; durationMs: number; errorType: string | null; errorMessage: string | null;
}

type Step = [step: string, model: string, base: number];
export const FIXTURE_CATS: Record<string, Step[]> = {
  guide_cockpit: [['route', 'haiku', 360], ['vec', 'te3large', 130], ['rrk', 'rerank35', 220], ['gen', 'sonnet', 2700]],
  guide_console: [['route', 'haiku', 340], ['vec', 'te3large', 120], ['rrk', 'rerank35', 200], ['gen', 'haiku', 1500]],
  data_cockpit: [['route', 'haiku', 380], ['qry', 'gpt5', 950], ['exe', 'svc', 280], ['gen', 'sonnet', 2900]],
  data_console: [['route', 'haiku', 370], ['qry', 'gpt5', 820], ['exe', 'svc', 210], ['gen', 'sonnet', 2500]],
  update_cockpit: [['route', 'haiku', 390], ['qry', 'gpt5', 1100], ['exe', 'svc', 640], ['gen', 'gpt5', 900]],
  kb_document: [['route', 'haiku', 360], ['vec', 'te3large', 260], ['rrk', 'rerank35', 340], ['gen', 'sonnet', 4300]],
};
export const FIXTURE_TIMEOUT = 'Délai dépassé (5 s)';

export function latencyFixture(yesterday: string, days = 7, perDay = 2): FixtureRow[] {
  const rows: FixtureRow[] = [];
  let n = 0;
  for (let d = 0; d < days; d++) {
    const iso = addDays(yesterday, -d);
    const [y, m, dd] = iso.split('-').map(Number);
    for (const [cat, steps] of Object.entries(FIXTURE_CATS)) {
      for (let j = 0; j < perDay; j++) {
        const requestId = `req_fx${++n}`;
        const t0 = parisTime(y, m, dd, 9 + j * 4, 0).getTime();
        let t = t0 + 5;
        const k = 0.85 + ((d * 3 + j * 2 + cat.length) % 7) / 20; // variation déterministe 0,85 … 1,15
        for (const [step, model, base] of steps) {
          const push = (mdl: string, role: string, ms: number, err: string | null) => {
            rows.push({ requestId, category: cat, step, model: mdl, role, startedAt: new Date(t), endedAt: new Date(t + ms), durationMs: ms, errorType: err, errorMessage: err });
            t += ms;
          };
          if (cat === 'kb_document' && step === 'rrk' && d % 3 === 0 && j === 0) push(model, 'primary', 5000, FIXTURE_TIMEOUT);
          else if (cat === 'guide_cockpit' && step === 'gen' && n % 10 === 0) { push(model, 'primary', 800, 'Erreur HTTP 529'); push('mlarge', 'fallback', Math.round(base * 1.2 * k), null); }
          else push(model, 'primary', Math.round(base * k), null);
        }
        rows.push({ requestId, category: cat, step: 'e2e', model: 'svc', role: 'primary', startedAt: new Date(t0), endedAt: new Date(t + 20), durationMs: t + 20 - t0, errorType: null, errorMessage: null });
      }
    }
  }
  return rows;
}
