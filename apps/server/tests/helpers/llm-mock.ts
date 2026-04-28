/**
 * Shared baseline for `mock.module('../src/agent/llm', ...)`.
 * See tests/helpers/ai-mock.ts for the rationale.
 */
export function llmMockBase(): Record<string, unknown> {
  return {
    createModel: () => ({}),
    createEmbeddingModel: () => ({}),
    isAnthropicModel: () => false,
    ANTHROPIC_CACHE_OPTIONS: { anthropic: { cacheControl: { type: 'ephemeral' as const } } },
  }
}
