import { providerCatalog, type ProviderId } from '../ai-providers/catalog'

export interface ModelOption {
  id: string
  label: string
  provider: ProviderId
}

/** Models surfaced directly in the picker: one best frontier pick per provider. */
export const PRIMARY_MODEL_IDS = ['claude-opus-4-8', 'gpt-5.5', 'gemini-3.1-pro-preview'] as const

export const DEFAULT_MODEL_ID = 'claude-opus-4-8'

const EXPLICIT_LABELS: Record<string, string> = {
  'gpt-4.1': 'GPT-4.1',
  'gpt-4.1-mini': 'GPT-4.1 Mini',
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini',
  'gpt-5.5': 'GPT-5.5',
  'gpt-5.4': 'GPT-5.4',
  'gpt-5.4-mini': 'GPT-5.4 Mini',
  'o4-mini': 'o4-mini',
  o3: 'o3',
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-2.0-flash': 'Gemini 2.0 Flash',
  'gemini-3.1-pro-preview': 'Gemini 3.1 Pro',
  'gemini-3.5-flash': 'Gemini 3.5 Flash',
  'gemini-3-flash': 'Gemini 3 Flash',
  'claude-haiku-4-5-20251001': 'Haiku 4.5',
}

const CLAUDE_RE = /^claude-(opus|sonnet|haiku)-(\d+)-(\d+)$/

/** Turn a raw model id into a friendly label (e.g. `claude-opus-4-8` → `Opus 4.8`). */
export function getModelLabel(modelId: string): string {
  if (EXPLICIT_LABELS[modelId]) return EXPLICIT_LABELS[modelId]

  const claude = CLAUDE_RE.exec(modelId)
  if (claude) {
    const [, family, major, minor] = claude
    return `${family.charAt(0).toUpperCase()}${family.slice(1)} ${major}.${minor}`
  }

  return modelId
}

function allModelOptions(): ModelOption[] {
  return providerCatalog.flatMap((provider) =>
    provider.models.map((id) => ({ id, label: getModelLabel(id), provider: provider.id })),
  )
}

/** Split the model catalog into visible frontier picks; settings still accept the full provider catalog. */
export function buildModelMenu(): { primary: ModelOption[]; more: ModelOption[] } {
  const options = allModelOptions()
  const byId = new Map(options.map((option) => [option.id, option]))

  const primary = PRIMARY_MODEL_IDS.map((id) => byId.get(id)).filter((option): option is ModelOption => Boolean(option))
  const primaryIds = new Set(primary.map((option) => option.id))
  const more = options.filter((option) => option.provider === 'openrouter' && !primaryIds.has(option.id))

  return { primary, more }
}

/** Resolve the provider that owns a model id (used to scope provider options). */
export function providerForModel(modelId: string): ProviderId | null {
  return providerCatalog.find((provider) => provider.models.includes(modelId))?.id ?? null
}
