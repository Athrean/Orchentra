/**
 * Best-effort USD cost estimation per model.
 * Rates are per 1 million tokens (input / output).
 * Unknown models fall back to a conservative estimate.
 */

interface TokenRates {
  inputPerM: number
  outputPerM: number
}

const MODEL_RATES: Record<string, TokenRates> = {
  // OpenRouter IDs under anthropic/*
  'anthropic/claude-3-5-sonnet': { inputPerM: 3.0, outputPerM: 15.0 },
  'anthropic/claude-3-5-haiku': { inputPerM: 0.8, outputPerM: 4.0 },
  'anthropic/claude-3-opus': { inputPerM: 15.0, outputPerM: 75.0 },
  'anthropic/claude-3-haiku': { inputPerM: 0.25, outputPerM: 1.25 },
  'anthropic/claude-sonnet-4': { inputPerM: 3.0, outputPerM: 15.0 },
  'anthropic/claude-opus-4': { inputPerM: 15.0, outputPerM: 75.0 },
  'anthropic/claude-haiku-4-5': { inputPerM: 0.8, outputPerM: 4.0 },
  // OpenRouter IDs under openai/*
  'openai/gpt-4o': { inputPerM: 2.5, outputPerM: 10.0 },
  'openai/gpt-4o-mini': { inputPerM: 0.15, outputPerM: 0.6 },
  'openai/gpt-4-turbo': { inputPerM: 10.0, outputPerM: 30.0 },
  // OpenRouter IDs under google/*
  'google/gemini-flash-1.5': { inputPerM: 0.075, outputPerM: 0.3 },
  'google/gemini-pro-1.5': { inputPerM: 1.25, outputPerM: 5.0 },
}

/** Conservative fallback when the model is unknown. */
const FALLBACK_RATES: TokenRates = { inputPerM: 3.0, outputPerM: 15.0 }

function getRates(modelId: string): TokenRates {
  // Exact match first
  if (modelId in MODEL_RATES) return MODEL_RATES[modelId]!
  // Prefix match (strip :variant suffixes on model IDs)
  const prefix = modelId.split(':')[0]!
  if (prefix in MODEL_RATES) return MODEL_RATES[prefix]!
  // Longest-prefix match — only when modelId starts with the key followed by ':' or '-' to avoid
  // cross-family collisions (e.g. "gpt-4o-mini" must not match "gpt-4o" rates).
  // Use longest key first so specific IDs win over shorter prefixes.
  const candidates = Object.entries(MODEL_RATES).filter(
    ([key]) => modelId.startsWith(key + ':') || modelId.startsWith(key + '-'),
  )
  if (candidates.length === 0) return FALLBACK_RATES
  candidates.sort((a, b) => b[0].length - a[0].length)
  return candidates[0]![1]
}

/**
 * Estimate USD cost for a single LLM call.
 * @param modelId - OpenRouter-style model identifier (e.g. "provider/model-name")
 * @param inputTokens - Number of prompt/input tokens consumed
 * @param outputTokens - Number of completion/output tokens produced
 */
export function estimateCostUsd(modelId: string, inputTokens: number, outputTokens: number): number {
  const rates = getRates(modelId)
  return (inputTokens * rates.inputPerM + outputTokens * rates.outputPerM) / 1_000_000
}
