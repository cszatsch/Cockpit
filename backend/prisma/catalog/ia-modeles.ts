/**
 * Catalogue des fournisseurs et modèles d'IA de la plateforme (recherche du 28/09/2026 sur les pages
 * officielles des fournisseurs ; sources ci-dessous, modèle par modèle).
 * Appliqué par `npm run ia:catalogue -- --confirmer` (scripts/ia-catalogue.ts) : ajoute ou met à jour.
 *
 * Tarifs : publiés en dollars par million de tokens (tarif API standard de base, hors cache, hors batch,
 * palier de contexte le plus bas), convertis en euros au cours de référence BCE ci-dessous.
 */

/** Cours de référence BCE (défini avec les règles de tarification, partagé avec les mesures OpenRouter). */
import { USD_PER_EUR, USD_PER_EUR_DATE } from '../../src/domain/ai-pricing';
export { USD_PER_EUR, USD_PER_EUR_DATE };

export interface CatalogProvider {
  id: string;
  name: string;
  /** Fournisseur créé sans clé : l'administrateur la saisit dans la console (« Remplacer la clé »). */
  note: string;
}

export interface CatalogModel {
  providerId: string;
  name: string;
  /** Identifiant de l'API du fournisseur (information, non utilisé par la passerelle bouchon). */
  apiId: string;
  description: string;
  category: 'LLM' | 'EMBEDDING' | 'RERANKING';
  releaseDate: string;
  /** LLM seulement. */
  maxOutputTokens?: number;
  /** Longueur de contexte (tokens), si relevée. */
  contextTokens?: number;
  /** Embedding : dimensions de sortie acceptées (vraiment proposées par le modèle) et valeur par défaut. */
  dimensions?: number[];
  defaultDimension?: number;
  /** Tarif publié, $ / M tokens (entrée seule pour Embedding et Reranking). */
  usd: { in: number; out?: number };
  sources: string[];
  /** Point d'attention (tarif temporaire, palier, retrait annoncé…). */
  note?: string;
}

export const CATALOG_PROVIDERS: CatalogProvider[] = [
  { id: 'openrouter', name: 'OpenRouter', note: 'Passerelle multi-fournisseurs ; clé à saisir dans la console. Test de clé : GET https://openrouter.ai/api/v1/key.' },
];

export const CATALOG_MODELS: CatalogModel[] = [
  // ───── Anthropic ─────
  {
    providerId: 'anthropic', name: 'Claude Opus 5.5', apiId: 'claude-opus-5-5', category: 'LLM',
    description: 'Code agentique de longue durée et travail intellectuel ; modèle conseillé par défaut par Anthropic.',
    releaseDate: '2026-09-22', maxOutputTokens: 128_000, usd: { in: 4, out: 20 },
    sources: ['https://platform.claude.com/docs/en/about-claude/models/overview', 'https://platform.claude.com/docs/en/about-claude/pricing', 'https://www.anthropic.com/claude-opus-5-5'],
    note: 'Jusqu’à 300K tokens de sortie en Batch API (en-tête bêta output-300k-2026-03-24).',
  },
  {
    providerId: 'anthropic', name: 'Claude Sonnet 5', apiId: 'claude-sonnet-5', category: 'LLM',
    description: 'Meilleur compromis vitesse et intelligence ; remplace Sonnet 4.6.',
    releaseDate: '2026-06-30', maxOutputTokens: 128_000, usd: { in: 2, out: 10 },
    sources: ['https://platform.claude.com/docs/en/about-claude/models/overview', 'https://platform.claude.com/docs/en/about-claude/pricing', 'https://www.anthropic.com/news/claude-sonnet-5'],
    note: 'Tarif de lancement devenu tarif standard (la hausse annoncée au 01/09/2026 n’a pas eu lieu).',
  },
  {
    providerId: 'anthropic', name: 'Claude Haiku 4.5', apiId: 'claude-haiku-4-5-20251001', category: 'LLM',
    description: 'Le plus rapide et le moins cher : tâches simples, faible latence, grand volume.',
    releaseDate: '2025-10-15', maxOutputTokens: 64_000, usd: { in: 1, out: 5 },
    sources: ['https://platform.claude.com/docs/en/about-claude/models/overview', 'https://platform.claude.com/docs/en/about-claude/model-deprecations', 'https://www.anthropic.com/news/claude-haiku-4-5'],
    note: 'Retrait annoncé « pas avant le 15/10/2026 ».',
  },
  // ───── Google ─────
  {
    providerId: 'google', name: 'Gemini 3.8 Flash', apiId: 'gemini-3.8-flash', category: 'LLM',
    description: 'Flash le plus avancé : génie logiciel sur tâches longues, agents autonomes, flux d’entreprise.',
    releaseDate: '2026-09-02', maxOutputTokens: 65_536, usd: { in: 0.75, out: 3.75 },
    sources: ['https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash', 'https://ai.google.dev/gemini-api/docs/pricing', 'https://blog.google/innovation-and-ai/models-and-research/gemini-models/3-8-flash-and-3-8-flash-cyber/'],
    note: 'Tarif de lancement jusqu’au 31/12/2026 ; 1,50 $ / 7,50 $ à partir du 01/01/2027 (à mettre à jour).',
  },
  {
    providerId: 'google', name: 'Gemini 3.5 Flash-Lite', apiId: 'gemini-3.5-flash-lite', category: 'LLM',
    description: 'Multimodal, faible latence et bas coût : sous-agents, analyse de documents, extraction en volume.',
    releaseDate: '2026-07-21', maxOutputTokens: 65_536, usd: { in: 0.3, out: 2.5 },
    sources: ['https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite', 'https://ai.google.dev/gemini-api/docs/pricing', 'https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-6-flash-3-5-flash-lite-3-5-flash-cyber/'],
  },
  // ───── OpenAI ─────
  {
    providerId: 'openai', name: 'GPT-6 Astra', apiId: 'gpt-6-astra', category: 'LLM',
    description: 'Le plus performant d’OpenAI : raisonnement complexe, code, utilisation d’ordinateur, recherche.',
    releaseDate: '2026-09-04', maxOutputTokens: 128_000, usd: { in: 10, out: 50 },
    sources: ['https://developers.openai.com/api/docs/models/gpt-6-astra', 'https://developers.openai.com/api/docs/pricing', 'https://en.wikipedia.org/wiki/GPT-6_Astra'],
    note: 'Annoncé le 03/09/2026 (aperçu), diffusé le 04/09/2026. Au-delà de 272K tokens d’entrée : 20 $ / 75 $.',
  },
  {
    providerId: 'openai', name: 'GPT-6 Sol', apiId: 'gpt-6-sol', category: 'LLM',
    description: 'Code complexe et flux agentiques, pour un coût inférieur à Astra.',
    releaseDate: '2026-09-22', maxOutputTokens: 128_000, usd: { in: 2, out: 10 },
    sources: ['https://developers.openai.com/api/docs/models/gpt-6-sol', 'https://developers.openai.com/api/docs/pricing', 'https://community.openai.com/t/announcing-gpt-6-sol-and-gpt-6-luna-in-the-api-codex-and-chatgpt/1399925'],
    note: 'Au-delà de 272K tokens d’entrée : 4 $ / 15 $.',
  },
  {
    providerId: 'openai', name: 'GPT-6 Luna', apiId: 'gpt-6-luna', category: 'LLM',
    description: 'Le plus efficace de la famille : tâches ciblées à fort volume.',
    releaseDate: '2026-09-22', maxOutputTokens: 128_000, usd: { in: 0.1, out: 0.5 },
    sources: ['https://developers.openai.com/api/docs/models/gpt-6-luna', 'https://developers.openai.com/api/docs/pricing', 'https://community.openai.com/t/announcing-gpt-6-sol-and-gpt-6-luna-in-the-api-codex-and-chatgpt/1399925'],
    note: 'Au-delà de 272K tokens d’entrée : 0,20 $ / 0,75 $.',
  },
  // ───── Mistral AI ─────
  // Mistral ne publie pas de limite de sortie distincte : « le prompt plus max_tokens ne peut pas dépasser
  // le contexte » (docs.mistral.ai/api). Max output retenu = contexte de 256k.
  {
    providerId: 'mistral', name: 'Mistral Medium 3.5', apiId: 'mistral-medium-3-5', category: 'LLM',
    description: 'Modèle phare multimodal (128 Md de paramètres, poids ouverts) pour les agents et le code.',
    releaseDate: '2026-04-28', maxOutputTokens: 256_000, usd: { in: 1.5, out: 7.5 },
    sources: ['https://docs.mistral.ai/models/model-cards/mistral-medium-3-5-26-04', 'https://docs.mistral.ai/getting-started/models/models_overview/', 'https://docs.mistral.ai/api/'],
    note: 'Max output non publié : borné par le contexte de 256k.',
  },
  {
    providerId: 'mistral', name: 'Mistral Small 4', apiId: 'mistral-small-2603', category: 'LLM',
    description: 'Modèle hybride économique (MoE) réunissant instruction, raisonnement et code.',
    releaseDate: '2026-03-16', maxOutputTokens: 256_000, usd: { in: 0.15, out: 0.6 },
    sources: ['https://docs.mistral.ai/models/mistral-small-4-0-26-03', 'https://docs.mistral.ai/getting-started/models/models_overview/', 'https://docs.mistral.ai/api/'],
    note: 'Max output non publié : borné par le contexte de 256k.',
  },
  {
    providerId: 'mistral', name: 'Ministral 3 14B', apiId: 'ministral-14b-2512', category: 'LLM',
    description: 'Le plus grand Ministral 3 (texte et vision), pour les tâches simples à faible coût.',
    releaseDate: '2025-12-02', maxOutputTokens: 256_000, usd: { in: 0.2, out: 0.2 },
    sources: ['https://docs.mistral.ai/models/ministral-3-14b-25-12', 'https://mistral.ai/news/mistral-3/', 'https://docs.mistral.ai/api/'],
    note: 'Max output non publié : borné par le contexte de 256k.',
  },
];

/** $ → €, arrondi à 4 décimales. */
/**
 * Modèles d'embedding et de reranking servis par OpenRouter (demande du 28/09/2026).
 * Identifiants et tarifs : API publique OpenRouter (GET /api/v1/embeddings/models, /api/v1/models?output_modalities=rerank),
 * tarifs Voyage recoupés sur docs.voyageai.com ; dates : annonces des éditeurs (pas la date de mise en ligne sur OpenRouter).
 */
export const OPENROUTER_MODELS: CatalogModel[] = [
  // ───── Embedding ─────
  {
    providerId: 'openrouter', name: 'Qwen3 Embedding 8B', apiId: 'qwen/qwen3-embedding-8b', category: 'EMBEDDING',
    description: 'Embedding multilingue pour textes longs : recherche de textes et de code, classification, clustering, alignement de traductions (bitext mining).',
    releaseDate: '2025-06-05', contextTokens: 32_768, usd: { in: 0.01 },
    // Dimension native 4096, réductible (MRL, 32 à 4096) : on ne propose que des tailles usuelles.
    dimensions: [4096, 2048, 1536, 1024, 512, 256], defaultDimension: 1024,
    sources: ['https://openrouter.ai/qwen/qwen3-embedding-8b', 'https://qwenlm.github.io/blog/qwen3-embedding/', 'https://huggingface.co/Qwen/Qwen3-Embedding-8B'],
    note: 'Défaut 1 024 : sous la limite d’index HNSW de pgvector (2 000 dimensions pour le type vector), bon compromis qualité / stockage.',
  },
  {
    providerId: 'openrouter', name: 'BAAI bge-m3', apiId: 'baai/bge-m3', category: 'EMBEDDING',
    description: 'Embedding multilingue produisant des vecteurs denses de 1 024 dimensions ; recherche sémantique et documents longs.',
    releaseDate: '2024-01-30', contextTokens: 8_192, usd: { in: 0.01 },
    dimensions: [1024], defaultDimension: 1024,
    sources: ['https://openrouter.ai/baai/bge-m3', 'https://github.com/FlagOpen/FlagEmbedding', 'https://huggingface.co/BAAI/bge-m3'],
    note: 'Dimension fixe (1 024) : pas de réduction possible.',
  },
  // ───── Reranking ─────
  {
    providerId: 'openrouter', name: 'Voyage rerank-2.5', apiId: 'voyageai/rerank-2.5', category: 'RERANKING',
    description: 'Reranker de qualité (VoyageAI by MongoDB) : environ 7,9 % de mieux que Cohere Rerank v3.5 sur 93 jeux de données ; accepte des instructions en langage naturel.',
    releaseDate: '2025-08-11', contextTokens: 32_000, usd: { in: 0.05 },
    sources: ['https://openrouter.ai/voyageai/rerank-2.5', 'https://blog.voyageai.com/2025/08/11/rerank-2-5/', 'https://docs.voyageai.com/docs/reranker', 'https://docs.voyageai.com/docs/pricing'],
    note: 'Contexte 32K (requête + document), requête limitée à 8K tokens.',
  },
  {
    providerId: 'openrouter', name: 'Voyage rerank-2.5-lite', apiId: 'voyageai/rerank-2.5-lite', category: 'RERANKING',
    description: 'Version rapide et économique de rerank-2.5 (VoyageAI by MongoDB) : environ 7,2 % de mieux que Cohere Rerank v3.5.',
    releaseDate: '2025-08-11', contextTokens: 32_000, usd: { in: 0.02 },
    sources: ['https://openrouter.ai/voyageai/rerank-2.5-lite', 'https://blog.voyageai.com/2025/08/11/rerank-2-5/', 'https://docs.voyageai.com/docs/reranker', 'https://docs.voyageai.com/docs/pricing'],
    note: 'Contexte 32K (requête + document), requête limitée à 8K tokens.',
  },
  // Ajouts du 06/10/2026 (demande du commanditaire) : LLM servis par OpenRouter ; données relevées sur l'API publique
  // d'OpenRouter (/api/v1/models) et les pages des modèles.
  {
    providerId: 'openrouter', name: 'Z.ai: GLM 5.3 Flash', apiId: 'z-ai/glm-5.3-flash', category: 'LLM',
    description: 'Modèle multimodal rapide de Z.ai pour le code et les tâches d’agent au long cours.',
    releaseDate: '2026-08-26', maxOutputTokens: 131_072, contextTokens: 1_048_576, usd: { in: 0.15, out: 0.5 },
    sources: ['https://openrouter.ai/z-ai/glm-5.3-flash', 'https://openrouter.ai/api/v1/models'],
    note: 'Max output : 131 072 chez la plupart des fournisseurs OpenRouter (un fournisseur annonce davantage).',
  },
  {
    providerId: 'openrouter', name: 'Qwen: Qwen3.8 Max (0902)', apiId: 'qwen/qwen3.8-max-0902', category: 'LLM',
    description: 'Version figée du 2 septembre de Qwen3.8 Max (Alibaba) : mixture d’experts de 2 400 Md de paramètres, texte, image et vidéo.',
    releaseDate: '2026-09-03', maxOutputTokens: 131_072, contextTokens: 1_000_000, usd: { in: 2, out: 6 },
    sources: ['https://openrouter.ai/qwen/qwen3.8-max-0902', 'https://openrouter.ai/api/v1/models'],
  },
  {
    providerId: 'openrouter', name: 'Xiaomi: MiMo-V2.6-Pro', apiId: 'xiaomi/mimo-v2.6-pro', category: 'LLM',
    description: 'Modèle phare de Xiaomi (plus de 1 000 Md de paramètres) pour les tâches les plus exigeantes.',
    releaseDate: '2026-09-21', maxOutputTokens: 131_072, contextTokens: 1_050_000, usd: { in: 0.435, out: 0.87 },
    sources: ['https://openrouter.ai/xiaomi/mimo-v2.6-pro', 'https://openrouter.ai/api/v1/models'],
  },
];

CATALOG_MODELS.push(...OPENROUTER_MODELS);

/**
 * Affectations par défaut créées si la fonction n'en a pas encore (spécification IA § 8) : le guidage console
 * sur un LLM rapide et économique, avec un secours chez un autre fournisseur. L'administrateur peut les changer.
 */
export const CATALOG_ASSIGNMENTS: Array<{ functionId: string; primary: [string, string]; fallback: [string, string] }> = [
  { functionId: 'guidage', primary: ['anthropic', 'Claude Haiku 4.5'], fallback: ['openai', 'GPT-6 Luna'] },
];

export const toEur = (usd: number) => Math.round((usd / USD_PER_EUR) * 10_000) / 10_000;
