import { ANTHROPIC_THINKING_MIN_TOKENS, anthropicThinking, OPENAI_REASONING_MIN_TOKENS, openaiMaxTokens } from '../../src/core/llm-client';

describe('Réflexion des modèles Anthropic (réponse vide « max_tokens · thinking », 01/10/2026)', () => {
  it('Sonnet 5 et Opus 5 (réflexion par défaut, désactivable) : réflexion coupée, plafond inchangé', () => {
    expect(anthropicThinking('claude-sonnet-5', 300)).toEqual({ max_tokens: 300, thinking: { type: 'disabled' } });
    expect(anthropicThinking('claude-opus-5', 1024)).toEqual({ max_tokens: 1024, thinking: { type: 'disabled' } });
  });

  it('modèles qui réfléchissent toujours (disabled refusé) : rien envoyé, plancher de jetons de sortie', () => {
    for (const m of ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1']) {
      expect(anthropicThinking(m, 300)).toEqual({ max_tokens: ANTHROPIC_THINKING_MIN_TOKENS });
      expect(anthropicThinking(m, 8000)).toEqual({ max_tokens: 8000 });
    }
  });

  it('Claude Haiku 5.5 (réflexion par défaut, désactivable, 13/10/2026) : réflexion coupée, plafond inchangé', () => {
    expect(anthropicThinking('claude-haiku-5-5', 300)).toEqual({ max_tokens: 300, thinking: { type: 'disabled' } });
  });

  it('autres modèles (Haiku 4.5…) : inchangés', () => {
    expect(anthropicThinking('claude-haiku-4-5', 300)).toEqual({ max_tokens: 300 });
    expect(anthropicThinking('claude-haiku-4-5-20251001', 1024)).toEqual({ max_tokens: 1024 });
  });
});

describe('Raisonnement des modèles OpenAI appelés directement (réponse vide « length · raisonnement », 13/10/2026)', () => {
  it('max_completion_tokens (GPT-5, GPT-6…) : plancher de jetons de sortie', () => {
    expect(openaiMaxTokens('max_completion_tokens', 300)).toBe(OPENAI_REASONING_MIN_TOKENS);
    expect(openaiMaxTokens('max_completion_tokens', 1024)).toBe(OPENAI_REASONING_MIN_TOKENS);
    expect(openaiMaxTokens('max_completion_tokens', 8000)).toBe(8000);
  });

  it('max_tokens (OpenRouter, Mistral, Groq…) : inchangé', () => {
    expect(openaiMaxTokens('max_tokens', 300)).toBe(300);
  });
});
