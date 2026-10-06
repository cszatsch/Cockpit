/**
 * Serveur de recette du préremplissage (07/10/2026) : l'application sur la base de test, avec le modèle d'IA remplacé
 * par les réponses simulées de l'exemple ORION (`test/fixtures/prefill-llm.ts`) — aucun appel réel, aucune dépense.
 *
 *   DATABASE_URL_TEST=postgresql://rise@localhost:5433/rise_test npx ts-node --transpile-only test/browser/prefill-server.ts
 *
 * Variables : RECETTE_PORT (3302), PREFILL_DELAY_MS (délai par onglet, 700), PREFILL_FAIL_AT (ex. « 07 Lots » : panne simulée).
 * Ouvrir ensuite http://localhost:3302/Console%20Admin.dc.html?as=u1 puis « Initialisation d’un projet ».
 */
import './prefill-server-env';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../src/app.factory';
import { encryptSecret } from '../../src/core/crypto';
import { LlmClient } from '../../src/core/llm-client';
import { orionAnswer } from '../fixtures/prefill-llm';

(async () => {
  const db = new PrismaClient();
  await db.provider.update({ where: { id: 'anthropic' }, data: { keyCipher: encryptSecret('sk-ant-recette-000000000000000AbCd'), status: 'OK' } });
  await db.provider.update({ where: { id: 'openai' }, data: { keyCipher: encryptSecret('sk-proj-recette-00000000000000WxYz'), status: 'OK' } });
  await db.$disconnect();
  const app = await createApp();
  const client = app.get(LlmClient);
  client.live = true;
  const delay = Number(process.env.PREFILL_DELAY_MS ?? 700);
  client.fetchImpl = (async (_url: string, init: any) => {
    const prompt = /ONGLET \d\d [^—]+—/.exec(init.body)?.[0] ?? '';
    await new Promise((r) => setTimeout(r, delay));
    if (process.env.PREFILL_FAIL_AT && prompt.includes(process.env.PREFILL_FAIL_AT)) return new Response('{"error":{"message":"panne simulée"}}', { status: 500 });
    return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(orionAnswer(prompt)) }], usage: { input_tokens: 2000, output_tokens: 300 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as any;
  const port = Number(process.env.RECETTE_PORT ?? 3302);
  await app.listen(port);
  console.log(`Recette du préremplissage : http://localhost:${port}/Console%20Admin.dc.html?as=u1`);
})();
