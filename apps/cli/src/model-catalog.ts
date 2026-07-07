export interface ModelOption {
  readonly id: string
  readonly label: string
  readonly provider: string
  readonly hint?: string
}

// Curated list of frontier models. OAuth-eligible Anthropic ones first since
// most users sign in with their Claude Pro / Max subscription.
export const MODEL_CATALOG: readonly ModelOption[] = [
  { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', provider: 'Anthropic', hint: 'most capable, slower' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'Anthropic', hint: 'balanced default' },
  {
    id: 'claude-haiku-4-5-20251001',
    label: 'Claude Haiku 4.5',
    provider: 'Anthropic',
    hint: 'fastest, cheapest',
  },
  { id: 'gpt-5', label: 'GPT-5', provider: 'OpenAI' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'Google' },
  { id: 'grok-4', label: 'Grok 4', provider: 'xAI' },
]

// Single source of truth for "no model chosen yet" fallbacks (fresh
// install, first prompt before /model or a settings.json override).
// Keep in sync with MODEL_CATALOG above — these were previously duplicated
// as stale, retired dated snapshots in several files independently.
export const DEFAULT_MODEL_ID = 'claude-sonnet-4-6'
export const DEFAULT_OPUS_MODEL_ID = 'claude-opus-4-7'
export const DEFAULT_HAIKU_MODEL_ID = 'claude-haiku-4-5-20251001'

const LABELS_BY_ID = new Map(MODEL_CATALOG.map((m) => [m.id, m.label]))

// A few well-known dated aliases that some callers still pass through.
LABELS_BY_ID.set('claude-sonnet-4-20250514', 'Claude Sonnet 4')
LABELS_BY_ID.set('claude-3-5-sonnet-20241022', 'Claude Sonnet 3.5')

/** Map a model id to its display label, falling back to the raw id. */
export function humanizeModelId(id: string): string {
  return LABELS_BY_ID.get(id) ?? id
}
