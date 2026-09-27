import { Injectable } from '@nestjs/common';

export interface KeyTestResult {
  status: 'OK' | 'ERROR';
  latencyMs: number | null;
  error: string | null;
}

/** Délai maximal d'un test de clé. */
export const KEY_TEST_TIMEOUT_MS = 10_000;

interface KeyProbe {
  /** Libellé du fournisseur (messages). */
  label: string;
  /** Reconnaît le fournisseur à son identifiant ou à son nom (« Mistral AI » → mistral-ai). */
  match: RegExp;
  /** Requête en lecture seule, sans génération ni coût : liste des modèles du compte. */
  request: (key: string) => { url: string; headers: Record<string, string> };
}

const bearer = (url: string) => (key: string) => ({ url, headers: { Authorization: `Bearer ${key}` } });

/**
 * Fournisseurs dont la clé se teste par un appel réel à leur API (décision du 28/09/2026).
 * Chaque test lit la liste des modèles : la clé est authentifiée sans consommer de jetons.
 */
export const KEY_PROBES: KeyProbe[] = [
  { label: 'Anthropic', match: /anthropic|claude/, request: (key) => ({ url: 'https://api.anthropic.com/v1/models?limit=1', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } }) },
  { label: 'OpenAI', match: /openai|chatgpt/, request: bearer('https://api.openai.com/v1/models') },
  { label: 'Mistral AI', match: /mistral/, request: bearer('https://api.mistral.ai/v1/models') },
  { label: 'Google Gemini', match: /google|gemini/, request: (key) => ({ url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', headers: { 'x-goog-api-key': key } }) },
  { label: 'Cohere', match: /cohere/, request: bearer('https://api.cohere.com/v1/models?page_size=1') },
  { label: 'Groq', match: /groq/, request: bearer('https://api.groq.com/openai/v1/models') },
  { label: 'DeepSeek', match: /deepseek/, request: bearer('https://api.deepseek.com/models') },
  { label: 'xAI', match: /(^|[^a-z])xai([^a-z]|$)|x-ai|grok/, request: bearer('https://api.x.ai/v1/models') },
];

/** Sonde du fournisseur, reconnue par son identifiant puis par son nom. */
export function probeFor(providerId: string, providerName = ''): KeyProbe | null {
  const hay = `${providerId} ${providerName}`.toLowerCase();
  return KEY_PROBES.find((p) => p.match.test(hay)) ?? null;
}

/** Message d'erreur du fournisseur (formats OpenAI, Anthropic, Google, Mistral, Cohere), sans jamais la clé. */
function providerMessage(body: string, key: string): string {
  let msg = '';
  try {
    const j = JSON.parse(body);
    const e = j?.error;
    msg = (typeof e === 'string' ? e : e?.message) ?? j?.message ?? j?.detail ?? '';
  } catch {
    msg = body;
  }
  msg = String(msg).replace(/\s+/g, ' ').trim();
  if (key.length >= 8) msg = msg.split(key).join('••••');
  return msg.slice(0, 160);
}

/**
 * Test réel d'une clé d'API : appel authentifié au fournisseur.
 * 2xx → clé valide ; 429 → clé reconnue (quota ou débit atteint) ; autre statut → clé refusée,
 * avec le code et le message du fournisseur ; réseau ou délai → fournisseur injoignable.
 * `fetchImpl` est remplacé par un double dans les tests, pour ne jamais sortir sur Internet.
 */
@Injectable()
export class ProviderKeyTester {
  fetchImpl: typeof fetch = (...args) => fetch(...args);

  async test(providerId: string, providerName: string, key: string): Promise<KeyTestResult> {
    const probe = probeFor(providerId, providerName);
    if (!probe) {
      return { status: 'ERROR', latencyMs: null, error: `Test impossible : fournisseur non reconnu (pris en charge : ${KEY_PROBES.map((p) => p.label).join(', ')})` };
    }
    const { url, headers } = probe.request(key);
    const t0 = Date.now();
    let res: Response;
    try {
      res = await this.fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(KEY_TEST_TIMEOUT_MS) });
    } catch (e: any) {
      const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
      const cause = e?.cause?.code ?? e?.code ?? e?.message ?? 'erreur réseau';
      return { status: 'ERROR', latencyMs: null, error: timeout ? `${probe.label} injoignable : délai de ${KEY_TEST_TIMEOUT_MS / 1000} s dépassé` : `${probe.label} injoignable (${cause})` };
    }
    const latencyMs = Date.now() - t0;
    const body = await res.text().catch(() => '');
    if (res.ok) return { status: 'OK', latencyMs, error: null };
    const msg = providerMessage(body, key);
    if (res.status === 429) return { status: 'OK', latencyMs, error: `429 · Clé valide, quota ou débit atteint${msg ? ` : ${msg}` : ''}` };
    return { status: 'ERROR', latencyMs: null, error: `${res.status} · Clé refusée par ${probe.label}${msg ? ` : ${msg}` : ''}` };
  }
}
