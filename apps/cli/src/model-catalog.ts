export interface ModelOption {
  readonly id: string
  readonly label: string
  /** Section heading in the picker, and the account the model is billed to. */
  readonly provider: string
  readonly hint?: string
  /** Right-aligned badge, e.g. 'Free'. */
  readonly tag?: string
}

/**
 * Curated catalog, grouped by the account that pays for each model. Section
 * order is picker order: the subscription tiers first, then bring-your-own-key
 * providers.
 *
 * Every id here was exercised against its live backend on 2026-09-07. Ids the
 * backend rejects are deliberately absent — a row that 400s on selection is
 * worse than no row, and the previous catalog shipped several (`gpt-5.4` is
 * refused on a ChatGPT plan; `gemini-3.1-pro-preview` 404s on Code Assist).
 *
 * Routing prefixes are load-bearing, not cosmetic:
 *   `antigravity/` — Code Assist's namespace overlaps both the public Gemini
 *                    API and Anthropic, and each host 404s on the other's ids.
 *   `go/` / `zen/` — same opencode key, different hosts: `/zen/go/v1` bills the
 *                    flat plan, `/zen/v1` bills prepaid credits.
 */
export const MODEL_CATALOG: readonly ModelOption[] = [
  // ── Claude Pro / Max ──────────────────────────────────────────────────────
  { id: 'claude-sonnet-5', label: 'Sonnet 5', provider: 'Anthropic', hint: 'efficient for routine tasks' },
  { id: 'claude-opus-5', label: 'Opus 5', provider: 'Anthropic', hint: 'everyday complex work · ~2x usage' },
  { id: 'claude-fable-5-1', label: 'Fable 5.1', provider: 'Anthropic', hint: 'most capable · usage credits' },
  {
    id: 'claude-haiku-4-5-20251001',
    label: 'Haiku 4.5',
    provider: 'Anthropic',
    hint: 'fastest for quick answers',
  },

  // ── ChatGPT Plus / Pro (Codex backend) ────────────────────────────────────
  { id: 'gpt-6-astra', label: 'gpt 6 astra', provider: 'OpenAI', hint: 'most capable' },
  { id: 'gpt-5.6-sol', label: 'gpt 5.6 sol', provider: 'OpenAI', hint: 'agentic workhorse' },
  { id: 'gpt-5.6-terra', label: 'gpt 5.6 terra', provider: 'OpenAI', hint: 'balanced agentic coding' },
  { id: 'gpt-5.6-luna', label: 'gpt 5.6 luna', provider: 'OpenAI', hint: 'fast and affordable' },
  { id: 'gpt-5.5', label: 'gpt 5.5', provider: 'OpenAI', hint: 'previous generation' },
  { id: 'gpt-5.4-mini', label: 'gpt 5.4 mini', provider: 'OpenAI', hint: 'small, fast, cheap' },

  // ── Google AI Pro / Ultra (Antigravity) ───────────────────────────────────
  {
    id: 'antigravity/gemini-3.6-flash-high',
    label: 'Gemini 3.6 Flash High',
    provider: 'Antigravity',
    hint: 'agentic default',
  },
  { id: 'antigravity/gemini-3.6-flash-medium', label: 'Gemini 3.6 Flash Medium', provider: 'Antigravity' },
  { id: 'antigravity/gemini-3.6-flash-low', label: 'Gemini 3.6 Flash Low', provider: 'Antigravity' },
  {
    id: 'antigravity/gemini-3.8-flash-tiered',
    label: 'Gemini 3.8 Flash',
    provider: 'Antigravity',
    hint: 'fastest',
  },
  { id: 'antigravity/gemini-3.1-pro-low', label: 'Gemini 3.1 Pro Low', provider: 'Antigravity', hint: 'deepest' },
  { id: 'antigravity/gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite', provider: 'Antigravity' },
  { id: 'antigravity/gemini-3-flash', label: 'Gemini 3 Flash', provider: 'Antigravity' },
  // Antigravity resells these through Vertex; they are a separate quota from a
  // Claude subscription, which is why they are worth listing twice.
  {
    id: 'antigravity/claude-opus-4-6-thinking',
    label: 'Claude Opus 4.6',
    provider: 'Antigravity',
    hint: 'thinking',
  },
  { id: 'antigravity/claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'Antigravity', hint: 'thinking' },

  // ── opencode Go (flat monthly plan) ───────────────────────────────────────
  { id: 'go/omen-alpha', label: 'Omen Alpha', provider: 'opencode Go', hint: 'newest' },
  { id: 'go/kimi-k3', label: 'Kimi K3', provider: 'opencode Go' },
  { id: 'go/kimi-k2.7-code', label: 'Kimi K2.7 Code', provider: 'opencode Go' },
  { id: 'go/kimi-k2.6', label: 'Kimi K2.6', provider: 'opencode Go' },
  { id: 'go/glm-5.3', label: 'GLM-5.3', provider: 'opencode Go' },
  { id: 'go/glm-5.3-flash', label: 'GLM-5.3 Flash', provider: 'opencode Go', hint: '2x usage' },
  { id: 'go/glm-5.2', label: 'GLM-5.2', provider: 'opencode Go' },
  { id: 'go/glm-5.1', label: 'GLM-5.1', provider: 'opencode Go' },
  { id: 'go/glm-5', label: 'GLM-5', provider: 'opencode Go' },
  { id: 'go/deepseek-v4-pro', label: 'DeepSeek V4 Pro', provider: 'opencode Go' },
  { id: 'go/deepseek-v4-flash', label: 'DeepSeek V4 Flash', provider: 'opencode Go' },
  {
    id: 'go/deepseek-v4-flash-vision-exp',
    label: 'DeepSeek V4 Flash Vision',
    provider: 'opencode Go',
    hint: 'experimental',
  },
  { id: 'go/qwen3.8-max', label: 'Qwen3.8 Max', provider: 'opencode Go' },
  { id: 'go/qwen3.8-flash', label: 'Qwen3.8 Flash', provider: 'opencode Go' },
  { id: 'go/qwen3.7-max', label: 'Qwen3.7 Max', provider: 'opencode Go' },
  { id: 'go/qwen3.7-plus', label: 'Qwen3.7 Plus', provider: 'opencode Go' },
  { id: 'go/qwen3.6-plus', label: 'Qwen3.6 Plus', provider: 'opencode Go' },
  { id: 'go/qwen3.5-plus', label: 'Qwen3.5 Plus', provider: 'opencode Go' },
  { id: 'go/minimax-m3', label: 'MiniMax-M3', provider: 'opencode Go' },
  { id: 'go/minimax-m2.7', label: 'MiniMax-M2.7', provider: 'opencode Go' },
  { id: 'go/minimax-m2.5', label: 'MiniMax-M2.5', provider: 'opencode Go' },
  { id: 'go/mimo-v2.5-pro', label: 'MiMo V2.5 Pro', provider: 'opencode Go' },
  { id: 'go/mimo-v2.5', label: 'MiMo V2.5', provider: 'opencode Go' },
  { id: 'go/mimo-v2-pro', label: 'MiMo V2 Pro', provider: 'opencode Go' },
  { id: 'go/mimo-v2-omni', label: 'MiMo V2 Omni', provider: 'opencode Go' },
  { id: 'go/longcat-2.0', label: 'LongCat-2.0', provider: 'opencode Go' },
  { id: 'go/hy4-preview', label: 'Hy4 Preview', provider: 'opencode Go' },
  { id: 'go/hy3', label: 'Hy3', provider: 'opencode Go' },
  { id: 'go/hy3-preview', label: 'Hy3 Preview', provider: 'opencode Go' },
  { id: 'go/grok-4.6', label: 'Grok 4.6', provider: 'opencode Go' },
  { id: 'go/grok-4.5', label: 'Grok 4.5', provider: 'opencode Go' },
  { id: 'go/gpt-5.6-luna', label: 'gpt 5.6 luna', provider: 'opencode Go' },
  { id: 'go/muse-spark-1.3-contributor', label: 'Muse Spark 1.3', provider: 'opencode Go', hint: 'contributor' },
  { id: 'go/muse-spark-1.2-contributor', label: 'Muse Spark 1.2', provider: 'opencode Go', hint: 'contributor' },

  // ── opencode Zen (prepaid credits; the free tier needs no balance) ────────
  { id: 'zen/muse-spark-1.3-contributor-free', label: 'Muse Spark 1.3', provider: 'opencode Zen', tag: 'Free' },
  { id: 'zen/muse-spark-1.2-contributor-free', label: 'Muse Spark 1.2', provider: 'opencode Zen', tag: 'Free' },
  { id: 'zen/nemotron-3-ultra-free', label: 'Nemotron 3 Ultra', provider: 'opencode Zen', tag: 'Free' },
  { id: 'zen/nemotron-3.5-lightning-free', label: 'Nemotron 3.5 Lightning', provider: 'opencode Zen', tag: 'Free' },
  { id: 'zen/ling-3.0-flash-fin-free', label: 'Ling 3.0 Flash Fin', provider: 'opencode Zen', tag: 'Free' },

  // ── Bring your own API key ────────────────────────────────────────────────
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', provider: 'Google', hint: 'needs GEMINI_API_KEY' },
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
export const DEFAULT_OPUS_MODEL_ID = 'claude-opus-5'
export const DEFAULT_HAIKU_MODEL_ID = 'claude-haiku-4-5-20251001'

/**
 * The model each sign-in switches the session to. Signing in is the user
 * saying "drive Orchentra with this account", so leaving the session pointed
 * at the previous provider makes a successful login look like a broken one —
 * which is exactly what an Antigravity or opencode Go sign-in did while the
 * status line still read `claude-sonnet-5 · anthropic`.
 *
 * Keys cover both /login tiers: subscription providers and API-key providers.
 */
export const SIGN_IN_DEFAULT_MODEL: Readonly<Record<string, string>> = {
  anthropic: DEFAULT_MODEL_ID,
  'anthropic-console': DEFAULT_MODEL_ID,
  codex: 'gpt-5.6-sol',
  openai: 'gpt-5.6-sol',
  antigravity: 'antigravity/gemini-3.6-flash-high',
  gemini: 'gemini-3.1-pro-preview',
  // The `/login` row is "opencode Go", so land on the plan's host. The Zen
  // free tier stays one `/model` away for a key with no Go plan.
  zen: 'go/omen-alpha',
  xai: 'grok-4.3',
  openrouter: 'z-ai/glm-5.2',
  dashscope: 'qwen/qwen3.6-35b-a3b',
}

/** Section headings in catalog order, deduplicated. */
export const MODEL_SECTIONS: readonly string[] = MODEL_CATALOG.map((m) => m.provider).filter(
  (name, i, all) => all.indexOf(name) === i,
)

const LABELS_BY_ID = new Map(MODEL_CATALOG.map((m) => [m.id, m.label]))

// A few well-known dated aliases that some callers still pass through.
LABELS_BY_ID.set('claude-fable-5', 'Fable 5')
LABELS_BY_ID.set('claude-opus-4-8', 'Opus 4.8')
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
