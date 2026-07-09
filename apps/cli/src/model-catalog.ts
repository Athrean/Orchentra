export interface ModelOption {
  readonly id: string
  readonly label: string
  readonly provider: string
  readonly hint?: string
}

// Curated list of frontier models. OAuth-eligible Anthropic ones first since
// most users sign in with their Claude Pro / Max subscription.
export const MODEL_CATALOG: readonly ModelOption[] = [
  { id: 'claude-fable-5', label: 'Fable 5', provider: 'Anthropic', hint: 'most capable' },
  { id: 'claude-opus-4-8', label: 'Opus 4.8', provider: 'Anthropic', hint: 'ZDR fallback' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5', provider: 'Anthropic', hint: 'agentic default' },
  {
    id: 'claude-haiku-4-5-20251001',
    label: 'Haiku 4.5',
    provider: 'Anthropic',
    hint: 'fastest, cheapest',
  },
  // The models the official Codex CLI drives through the ChatGPT backend, so a
  // ChatGPT Plus/Pro sign-in can use any of them. (gpt-5-codex is platform-API
  // only — a ChatGPT account 400s on it.)
  { id: 'gpt-5.5', label: 'gpt 5.5', provider: 'OpenAI', hint: 'Codex flagship · ChatGPT plan' },
  { id: 'gpt-5.4', label: 'gpt 5.4', provider: 'OpenAI', hint: 'everyday coding' },
  { id: 'gpt-5.4-mini', label: 'gpt 5.4 mini', provider: 'OpenAI', hint: 'budget' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', provider: 'Google' },
  { id: 'grok-4.3', label: 'Grok 4.3', provider: 'xAI' },
  { id: 'mistralai/mistral-medium-3-5', label: 'Mistral Medium 3.5', provider: 'OpenRouter' },
  { id: 'z-ai/glm-5.2', label: 'GLM 5.2', provider: 'OpenRouter' },
  { id: 'qwen/qwen3.6-35b-a3b', label: 'Qwen3.6 35B A3B', provider: 'OpenRouter', hint: 'open-weight' },
  { id: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro', provider: 'OpenRouter' },
  { id: 'openai/gpt-oss-120b', label: 'gpt-oss-120b', provider: 'OpenRouter', hint: 'open reasoning' },
]

// Single source of truth for "no model chosen yet" fallbacks (fresh install,
// first prompt before /model or a settings.json override). Keep in sync with
// MODEL_CATALOG above — retired dated snapshots were previously duplicated
// across args.ts, init.ts, first-run-flow.ts, and the builtin aliases.
export const DEFAULT_MODEL_ID = 'claude-sonnet-5'
export const DEFAULT_OPUS_MODEL_ID = 'claude-opus-4-8'
export const DEFAULT_HAIKU_MODEL_ID = 'claude-haiku-4-5-20251001'

const LABELS_BY_ID = new Map(MODEL_CATALOG.map((m) => [m.id, m.label]))

// A few well-known dated aliases that some callers still pass through.
LABELS_BY_ID.set('claude-opus-4-7', 'Opus 4.7')
LABELS_BY_ID.set('claude-sonnet-4-6', 'Sonnet 4.6')
LABELS_BY_ID.set('claude-sonnet-4-20250514', 'Sonnet 4')
LABELS_BY_ID.set('claude-3-5-sonnet-20241022', 'Sonnet 3.5')
LABELS_BY_ID.set('ollama/gpt-oss:120b', 'gpt-oss-120b')
LABELS_BY_ID.set('ollama/qwen3.6:35b', 'Qwen3.6 35B')

/** Map a model id to its display label, falling back to the raw id. */
export function humanizeModelId(id: string): string {
  return LABELS_BY_ID.get(id) ?? id
}
