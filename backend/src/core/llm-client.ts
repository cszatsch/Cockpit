import { note, span } from './trace';
import { Injectable } from '@nestjs/common';
import { config } from './config';

/** Délai maximal d'une génération réelle (fonctions « en direct »). */
export const LLM_CALL_TIMEOUT_MS = 30_000;

/** Tour précédent d'une conversation (mémoire de Jev, décision du 30/09/2026). */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface LiveCall {
  /** Fournisseur (identifiant et nom : reconnaissance du protocole, comme le test des clés). */
  providerId: string;
  providerName: string;
  /** Identifiant du modèle chez le fournisseur (`AiModel.providerModelId`, sinon `AiModel.id`). */
  model: string;
  key: string;
  /** Partie stable du prompt système (mise en cache chez Anthropic quand `cache` est vrai). */
  system: string;
  /** Partie variable du prompt système (page ouverte, date et heure, résumé), envoyée après la partie stable. */
  systemTail?: string;
  /** Tours précédents de la conversation, du plus ancien au plus récent. */
  history?: ChatTurn[];
  /** Marque la partie stable pour le cache de prompt (Anthropic ; automatique chez OpenAI et Gemini). */
  cache?: boolean;
  prompt: string;
  maxTokens: number;
  /** Délai de l'appel (ms) ; défaut `LLM_CALL_TIMEOUT_MS`. */
  timeoutMs?: number;
}

export interface LiveResult {
  text: string;
  /** Jetons comptés par le fournisseur ; null s'il ne les renvoie pas (estimation alors). */
  tokensIn: number | null;
  tokensOut: number | null;
  /** Jetons d'entrée lus dans le cache (facturés à `CACHE_READ_FACTOR`) et écrits dans le cache (`CACHE_WRITE_FACTOR`), compris dans `tokensIn`. */
  cacheRead?: number;
  cacheWrite?: number;
}

/** Cache de prompt : lecture facturée 0,1 × le prix d'entrée, écriture 1,25 × (cache de 5 min d'Anthropic ; OpenAI : lecture seule). */
export const CACHE_READ_FACTOR = 0.1;
export const CACHE_WRITE_FACTOR = 1.25;

/** Appel d'embedding (vectorisation) : une liste de textes, une dimension demandée si le modèle en propose plusieurs. */
export interface EmbedCall {
  providerId: string;
  providerName: string;
  model: string;
  key: string;
  inputs: string[];
  /** Dimension demandée au fournisseur (modèles « Matryoshka ») ; absente : dimension native. */
  dimensions?: number | null;
  /** Délai de l'appel (ms) ; défaut `EMBED_CALL_TIMEOUT_MS`. */
  timeoutMs?: number;
}

/** Reclassement (reranking) : documents classés par pertinence pour une question. */
export interface RerankCall {
  providerId: string;
  providerName: string;
  model: string;
  key: string;
  query: string;
  documents: string[];
  topN: number;
  timeoutMs?: number;
}

export interface RerankResult {
  /** Index du document dans la liste envoyée et score de pertinence, du plus pertinent au moins pertinent. */
  results: Array<{ index: number; score: number }>;
  tokens: number | null;
}

export interface EmbedResult {
  vectors: number[][];
  /** Jetons comptés par le fournisseur ; null s'il ne les renvoie pas (estimation alors). */
  tokens: number | null;
}

/** Délai maximal d'un appel d'embedding (un lot de textes). */
export const EMBED_CALL_TIMEOUT_MS = 60_000;

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

const num = (x: unknown) => (typeof x === 'number' && x > 0 ? x : 0);

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
      // Partie stable en premier bloc, marquée pour le cache ; partie variable ensuite (elle n'invalide pas le cache).
      const system = c.cache || c.systemTail
        ? [{ type: 'text', text: c.system, ...(c.cache ? { cache_control: { type: 'ephemeral' } } : {}) }, ...(c.systemTail ? [{ type: 'text', text: c.systemTail }] : [])]
        : c.system;
      const j = await this.post('Anthropic', 'https://api.anthropic.com/v1/messages', { 'x-api-key': c.key, 'anthropic-version': '2023-06-01' }, {
        model: c.model, max_tokens: c.maxTokens, system, messages: [...(c.history ?? []), { role: 'user', content: c.prompt }],
      }, c.key, c.timeoutMs);
      const text = (j?.content ?? []).filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('').trim();
      const u = j?.usage ?? {}, read = num(u.cache_read_input_tokens), write = num(u.cache_creation_input_tokens);
      return { ...this.result('Anthropic', text, typeof u.input_tokens === 'number' ? u.input_tokens + read + write : undefined, u.output_tokens), cacheRead: read, cacheWrite: write };
    }
    if (p.kind === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(c.model)}:generateContent`;
      const j = await this.post('Google Gemini', url, { 'x-goog-api-key': c.key }, {
        systemInstruction: { parts: [{ text: c.system }, ...(c.systemTail ? [{ text: c.systemTail }] : [])] },
        contents: [...(c.history ?? []).map((h) => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] })), { role: 'user', parts: [{ text: c.prompt }] }],
        generationConfig: { maxOutputTokens: c.maxTokens },
      }, c.key, c.timeoutMs);
      const text = (j?.candidates?.[0]?.content?.parts ?? []).map((x: any) => x?.text ?? '').join('').trim();
      return { ...this.result('Google Gemini', text, j?.usageMetadata?.promptTokenCount, j?.usageMetadata?.candidatesTokenCount), cacheRead: num(j?.usageMetadata?.cachedContentTokenCount), cacheWrite: 0 };
    }
    const j = await this.post(p.label, `${p.base}/chat/completions`, { Authorization: `Bearer ${c.key}` }, {
      // Partie stable, historique, puis partie variable : le préfixe (système + historique) profite du cache automatique.
      model: c.model, [p.maxField]: c.maxTokens,
      messages: [{ role: 'system', content: c.system }, ...(c.history ?? []), ...(c.systemTail ? [{ role: 'system', content: c.systemTail }] : []), { role: 'user', content: c.prompt }],
    }, c.key, c.timeoutMs);
    const text = String(j?.choices?.[0]?.message?.content ?? '').trim();
    return { ...this.result(p.label, text, j?.usage?.prompt_tokens, j?.usage?.completion_tokens), cacheRead: num(j?.usage?.prompt_tokens_details?.cached_tokens), cacheWrite: 0 };
  }

  /**
   * Vectorisation réelle (décision du 30/09/2026) : API compatibles OpenAI (`/embeddings` : OpenRouter, OpenAI,
   * Mistral…) et Google Gemini (`batchEmbedContents`). Anthropic ne propose pas d'embedding.
   */
  async embed(c: EmbedCall): Promise<EmbedResult> {
    const p = protocolFor(c.providerId, c.providerName);
    if (!p) throw new LlmCallError(`Vectorisation impossible : fournisseur ${c.providerName || c.providerId} non pris en charge`);
    if (p.kind === 'anthropic') throw new LlmCallError('Anthropic ne propose pas de modèle d’embedding');
    let vectors: unknown[];
    let tokens: number | null = null;
    if (p.kind === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(c.model)}:batchEmbedContents`;
      const j = await this.post('Google Gemini', url, { 'x-goog-api-key': c.key }, {
        requests: c.inputs.map((text) => ({ model: `models/${c.model}`, content: { parts: [{ text }] }, taskType: 'RETRIEVAL_DOCUMENT', ...(c.dimensions ? { outputDimensionality: c.dimensions } : {}) })),
      }, c.key, c.timeoutMs ?? EMBED_CALL_TIMEOUT_MS);
      vectors = (j?.embeddings ?? []).map((e: any) => e?.values);
    } else {
      const j = await this.post(p.label, `${p.base}/embeddings`, { Authorization: `Bearer ${c.key}` }, {
        model: c.model, input: c.inputs, encoding_format: 'float', ...(c.dimensions ? { dimensions: c.dimensions } : {}),
      }, c.key, c.timeoutMs ?? EMBED_CALL_TIMEOUT_MS);
      vectors = [...(j?.data ?? [])].sort((a: any, b: any) => (a?.index ?? 0) - (b?.index ?? 0)).map((d: any) => d?.embedding);
      tokens = typeof j?.usage?.prompt_tokens === 'number' ? j.usage.prompt_tokens : typeof j?.usage?.total_tokens === 'number' ? j.usage.total_tokens : null;
    }
    const label = p.kind === 'gemini' ? 'Google Gemini' : p.label;
    if (vectors.length !== c.inputs.length || !vectors.every((v) => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'number'))) throw new LlmCallError(`${label} : réponse d’embedding illisible`);
    return { vectors: vectors as number[][], tokens };
  }

  /**
   * Reclassement réel (décision du 30/09/2026) : API compatibles OpenAI qui exposent `/rerank` (OpenRouter : modèles
   * Voyage rerank). Réponse au format `results` (ou `data`) : index du document et `relevance_score`.
   */
  async rerank(c: RerankCall): Promise<RerankResult> {
    const p = protocolFor(c.providerId, c.providerName);
    if (!p || p.kind !== 'openai') throw new LlmCallError(`Reclassement impossible : fournisseur ${c.providerName || c.providerId} non pris en charge`);
    const j = await this.post(p.label, `${p.base}/rerank`, { Authorization: `Bearer ${c.key}` }, { model: c.model, query: c.query, documents: c.documents, top_n: c.topN }, c.key, c.timeoutMs ?? EMBED_CALL_TIMEOUT_MS);
    const list: any[] = Array.isArray(j?.results) ? j.results : Array.isArray(j?.data) ? j.data : [];
    const results = list.map((r) => ({ index: Number(r?.index), score: Number(r?.relevance_score ?? r?.score) })).filter((r) => Number.isInteger(r.index) && r.index >= 0 && r.index < c.documents.length && Number.isFinite(r.score));
    if (!results.length) throw new LlmCallError(`${p.label} : réponse de reclassement illisible`);
    results.sort((a, b) => b.score - a.score);
    const u = j?.usage ?? {};
    return { results, tokens: typeof u.total_tokens === 'number' ? u.total_tokens : typeof u.prompt_tokens === 'number' ? u.prompt_tokens : null };
  }

  private result(label: string, text: string, tin: unknown, tout: unknown): LiveResult {
    if (!text) throw new LlmCallError(`${label} : réponse vide`);
    return { text, tokensIn: typeof tin === 'number' ? tin : null, tokensOut: typeof tout === 'number' ? tout : null };
  }

  private post(label: string, url: string, headers: Record<string, string>, body: unknown, key: string, timeoutMs = LLM_CALL_TIMEOUT_MS): Promise<any> {
    const path = (() => { try { return new URL(url).pathname.replace(/\/models\/[^/:]+/, '/models/…'); } catch { return url; } })();
    return span(`HTTP POST ${label} ${path}`, (d) => this.postTimed(label, url, headers, body, key, timeoutMs, d), { delai_max_ms: timeoutMs });
  }

  /**
   * Appel chronométré (traces de Jev, 01/10/2026) : préparation, envoi jusqu'aux en-têtes de la réponse (connexion,
   * envoi, traitement chez le fournisseur, premier octet), lecture du corps, analyse ; statut, taille et en-têtes de
   * temps du fournisseur relevés dans la trace.
   */
  private async postTimed(label: string, url: string, headers: Record<string, string>, body: unknown, key: string, timeoutMs: number, d: Record<string, unknown>): Promise<any> {
    let t = performance.now();
    const payload = JSON.stringify(body);
    d.requete_octets = payload.length;
    let res: Response;
    try {
      res = await this.fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers }, body: payload, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e: any) {
      const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
      note('attente des en-têtes (connexion + envoi + traitement fournisseur + 1er octet)', { issue: timeout ? 'délai dépassé' : 'injoignable', cause: String(e?.cause?.code ?? e?.cause?.message ?? e?.message ?? '').slice(0, 160) }, Math.round(performance.now() - t));
      throw new LlmCallError(timeout ? `${label} : délai de ${timeoutMs / 1000} s dépassé` : `${label} injoignable`);
    }
    const ttfb = Math.round(performance.now() - t);
    d.statut = res.status;
    const timing: Record<string, string> = {};
    res.headers?.forEach?.((v, k) => { if (/(processing|timing|request-id|x-request|generation|provider|cf-ray|x-cache|^age$|^via$|^server$)/i.test(k)) timing[k] = String(v).slice(0, 120); });
    note('attente des en-têtes (connexion + envoi + traitement fournisseur + 1er octet)', Object.keys(timing).length ? { entetes_fournisseur: timing } : undefined, ttfb);
    t = performance.now();
    const raw = await res.text().catch(() => '');
    note('lecture du corps de la réponse', { octets: raw.length }, Math.round(performance.now() - t));
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
      t = performance.now();
      const j = JSON.parse(raw);
      note('analyse JSON', undefined, Math.round(performance.now() - t));
      return j;
    } catch {
      throw new LlmCallError(`${label} : réponse illisible`);
    }
  }
}
