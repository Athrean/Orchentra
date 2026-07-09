const KNOWN_MODEL_PATTERNS: RegExp[] = [
  /^claude-(fable|opus|sonnet|haiku)-\d/i,
  /^(anthropic|openai|google|x-ai|mistralai|deepseek|qwen|z-ai|zhipu)\//i,
  /^gpt-\d/i,
  /^gpt-oss-\d/i,
  /^o\d(-mini)?$/i,
  /^gemini-\d/i,
  /^grok-\d(-mini)?/i,
  /^qwen[\d-]/i,
  /^deepseek/i,
  /^mistral/i,
  /^ollama\//i,
]

export function isKnownModel(model: string): boolean {
  if (!model || typeof model !== 'string') return false
  const trimmed = model.trim()
  if (trimmed.length === 0) return false
  return KNOWN_MODEL_PATTERNS.some((re) => re.test(trimmed))
}
