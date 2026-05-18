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

const LABELS_BY_ID = new Map(MODEL_CATALOG.map((m) => [m.id, m.label]))

// A few well-known dated aliases that some callers still pass through.
LABELS_BY_ID.set('claude-sonnet-4-20250514', 'Claude Sonnet 4')
LABELS_BY_ID.set('claude-3-5-sonnet-20241022', 'Claude Sonnet 3.5')

/** Map a model id to its display label, falling back to the raw id. */
export function humanizeModelId(id: string): string {
  return LABELS_BY_ID.get(id) ?? id
}
