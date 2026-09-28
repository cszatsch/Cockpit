import { Injectable } from '@nestjs/common';
import { config } from './config';

/** Délai maximal d'une génération réelle (fonctions « en direct »). */
export const LLM_CALL_TIMEOUT_MS = 30_000;

export interface LiveCall {
  /** Fournisseur (identifiant et nom : reconnaissance du protocole, comme le test des clés). */
  providerId: string;
  providerName: string;
  /** Identifiant du modèle chez le fournisseur (`AiModel.providerModelId`, sinon `AiModel.id`). */
  model: string;
  key: string;
  system: string;
  prompt: string;
  maxTokens: number;
}

export interface LiveResult {
  text: string;
  /** Jetons comptés par le fournisseur ; null s'il ne les renvoie pas (estimation alors). */
  tokensIn: number | null;
  tokensOut: number | null;
}

/** Échec d'une génération réelle : message sans jamais la clé. */
export class LlmCallError extends Error {}

type Protocol = { kind: 'anthropic' } | { kind: 'gemini' } | { kind: 'openai'; base: string; label: string; maxField: 'max_tokens' | 'max_completion_tokens' };

const PROTOCOLS: Array<{ match: RegExp; p: Protocol }> = [
  { match: /anthropic|claude/, p: { kind: 'anthropic' } },
  { match: /google|gemini/, p: { kind: 'gemini' } },
  { match: /openrouter/, p: { kind: 'openai', base: 'https://openrouter.ai/api/v1', label: 'OpenRouter', maxField: 'max_tokens' } },
  { match: /openai|chatgpt/, p: { kind: 'openai', base: 'https://api.openai.com/v1', label: 'OpenAI', maxField: 'max_completion_tokens' } },
  { match: /mistral/, p: { kind: 'openai', base: 'https://api.mistral.ai/v1', label: 'Mistral AI', maxField: 'max_tokens' } },
  { match: /groq/, p: { kind: 'openai', base: 'https://api.groq.com/openai/v1', label: 'Groq', maxField: 'max_tokens' } },
  { match: /deepseek/, p: { kind: 'openai', base: 'https://api.deepseek.com', label: 'DeepSeek', maxField: 'max_tokens' } },
  { match: /(^|[^a-z])xai([^a-z]|$)|x-ai|grok/, p: { kind: 'openai', base: 'https://api.x.ai/v1', label: 'xAI', maxField: 'max_tokens' } },
];

export function protocolFor(providerId: string, providerName = ''): Protocol | null {
  const hay = `${providerId} ${providerName}`.toLowerCase();
  return PROTOCOLS.find((x) => x.match.test(hay))?.p ?? null;
}

/**
 * Génération réelle auprès du fournisseur du modèle (fonctions listées dans `LIVE_FUNCTIONS`, décision du 28/09/2026).
 * `live` vaut faux hors ligne (tests) : la passerelle garde alors son bouchon. `fetchImpl` est remplacé par un double
 * dans les tests, pour ne jamais sortir sur Internet.
 */
@Injectable()
export class LlmClient {
  live = !config.offline;
  fetchImpl: typeof fetch = (...args) => fetch(...args);

  async generate(c: LiveCall): Promise<LiveResult> {
    const p = protocolFor(c.providerId, c.providerName);
    if (!p) throw new LlmCallError(`Génération impossible : fournisseur ${c.providerName || c.providerId} non pris en charge`);
    if (p.kind === 'anthropic') {
      const j = await this.post('Anthropic', 'https://api.anthropic.com/v1/messages', { 'x-api-key': c.key, 'anthropic-version': '2023-06-01' }, {
        model: c.model, max_tokens: c.maxTokens, system: c.system, messages: [{ role: 'user', content: c.prompt }],
      }, c.key);
      const text = (j?.content ?? []).filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('').trim();
      return this.result('Anthropic', text, j?.usage?.input_tokens, j?.usage?.output_tokens);
    }
    if (p.kind === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(c.model)}:generateContent`;
      const j = await this.post('Google Gemini', url, { 'x-goog-api-key': c.key }, {
        systemInstruction: { parts: [{ text: c.system }] }, contents: [{ role: 'user', parts: [{ text: c.prompt }] }], generationConfig: { maxOutputTokens: c.maxTokens },
      }, c.key);
      const text = (j?.candidates?.[0]?.content?.parts ?? []).map((x: any) => x?.text ?? '').join('').trim();
      return this.result('Google Gemini', text, j?.usageMetadata?.promptTokenCount, j?.usageMetadata?.candidatesTokenCount);
    }
    const j = await this.post(p.label, `${p.base}/chat/completions`, { Authorization: `Bearer ${c.key}` }, {
      model: c.model, [p.maxField]: c.maxTokens, messages: [{ role: 'system', content: c.system }, { role: 'user', content: c.prompt }],
    }, c.key);
    const text = String(j?.choices?.[0]?.message?.content ?? '').trim();
    return this.result(p.label, text, j?.usage?.prompt_tokens, j?.usage?.completion_tokens);
  }

  private result(label: string, text: string, tin: unknown, tout: unknown): LiveResult {
    if (!text) throw new LlmCallError(`${label} : réponse vide`);
    return { text, tokensIn: typeof tin === 'number' ? tin : null, tokensOut: typeof tout === 'number' ? tout : null };
  }

  private async post(label: string, url: string, headers: Record<string, string>, body: unknown, key: string): Promise<any> {
    let res: Response;
    try {
      res = await this.fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(LLM_CALL_TIMEOUT_MS) });
    } catch (e: any) {
      const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
      throw new LlmCallError(timeout ? `${label} : délai de ${LLM_CALL_TIMEOUT_MS / 1000} s dépassé` : `${label} injoignable`);
    }
    const raw = await res.text().catch(() => '');
    if (!res.ok) {
      let msg = '';
      try {
        const j = JSON.parse(raw);
        msg = typeof j?.error === 'string' ? j.error : j?.error?.message ?? j?.message ?? '';
      } catch {
        msg = '';
      }
      msg = String(msg).replace(/\s+/g, ' ').trim();
      if (key.length >= 8) msg = msg.split(key).join('••••');
      throw new LlmCallError(`${label} · ${res.status}${msg ? ` : ${msg.slice(0, 160)}` : ''}`);
    }
    try {
      return JSON.parse(raw);
    } catch {
      throw new LlmCallError(`${label} : réponse illisible`);
    }
  }
}
