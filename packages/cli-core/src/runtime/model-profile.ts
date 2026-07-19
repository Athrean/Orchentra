/**
 * ModelProfile registry — the single home for per-model-family knowledge
 * (M5, docs/planning/02-MILESTONES.md). Keyed by model family; provider
 * routing, known-model patterns, and (from v0.8.0 on) per-family
 * specializations all resolve through {@link profileFor} instead of ad hoc
 * string sniffing scattered across the codebase.
 *
 * The justification bar: a profile may only diverge from generic harness
 * behavior with a counter-backed reason. Every divergence names the
 * {@link QuirkKind} that motivated it and the observed count; {@link
 * validateProfileDivergences} rejects any divergence a quirks snapshot
 * (QuirkCounters.snapshot(), persisted in trace manifests) does not support.
 * Provider routing and family matching are plumbing, not divergences — they
 * carry no justification burden and survive generic mode untouched.
 */

import type { QuirkKind } from './quirks'

export type ProviderName = 'anthropic' | 'openai' | 'openrouter' | 'xai' | 'dashscope' | 'gemini' | 'local'

/** A counter-backed deviation from generic harness behavior. */
export interface ProfileDivergence {
  /** Which profile knob diverges (e.g. 'editDialect', 'toolVocabulary'). */
  field: string
  /** The quirk that motivated the divergence. */
  quirk: QuirkKind
  /** Count observed when the divergence was justified. */
  observedCount: number
  /** Where the counts came from (trace manifest / scoreboard reference). */
  evidence: string
}

/**
 * Editing contract exposed to the model. 'replace' is the generic
 * old_string/new_string edit_file tool; 'unified-diff' swaps it for
 * apply_patch (unified-diff hunks) — for families whose counters show they
 * fumble the replace contract.
 */
export type EditDialect = 'replace' | 'unified-diff'

export interface ModelProfile {
  /** Model family (claude, gpt, gemini, …) — the specialization key. */
  readonly family: string
  /** Model-id patterns this profile matches. First matching profile wins. */
  readonly match: readonly RegExp[]
  /** Provider route for matched models. */
  readonly provider: ProviderName
  /**
   * Whether this family's current models accept image input. Plumbing (a
   * factual capability), not a divergence — it carries no justification burden
   * and survives generic mode, exactly like `provider` and `family`. Gates
   * image sends so a screenshot is never silently dropped onto a text model.
   */
  readonly vision?: boolean
  /** Counter-backed deviations from generic behavior. Empty = generic. */
  readonly divergences: readonly ProfileDivergence[]
  // ── Specializations. Each set field is a divergence and must be justified
  // by a divergences entry with the matching field name, or the registry
  // fails validateProfileDivergences. Generic mode strips them all.
  /** Editing contract (divergence field: 'editDialect'). */
  readonly editDialect?: EditDialect
  /** Per-tool description overrides (divergence field: 'toolDescriptions'). */
  readonly toolDescriptions?: Readonly<Record<string, string>>
  /** Extra system-prompt text (divergence field: 'systemPromptFragment'). */
  readonly systemPromptFragment?: string
}

/** Fallback when nothing matches — mirrors the old default-to-Anthropic route. */
export const GENERIC_PROFILE: ModelProfile = {
  family: 'generic',
  match: [],
  provider: 'anthropic',
  divergences: [],
}

/**
 * Ordered registry; first match wins. Order preserves the retired
 * provider-factory heuristics exactly: ollama → OpenRouter prefixes →
 * openai → xai → dashscope → gemini → anthropic fallback.
 * No profile diverges yet — v0.8.0 ships the registry and the bar; the first
 * candidate divergence (edit dialect) lands with Loop 17 evidence in hand.
 */
export const MODEL_PROFILES: readonly ModelProfile[] = [
  { family: 'local', match: [/^ollama\//i], provider: 'local', divergences: [] },
  // OpenRouter-hosted families keep their real family name so per-family
  // specialization applies regardless of route.
  { family: 'claude', match: [/^anthropic\//i], provider: 'openrouter', vision: true, divergences: [] },
  { family: 'gpt', match: [/^openai\//i], provider: 'openrouter', vision: true, divergences: [] },
  { family: 'gemini', match: [/^google\//i], provider: 'openrouter', vision: true, divergences: [] },
  { family: 'grok', match: [/^x-ai\//i], provider: 'openrouter', vision: true, divergences: [] },
  { family: 'mistral', match: [/^mistralai\//i], provider: 'openrouter', divergences: [] },
  { family: 'deepseek', match: [/^deepseek\//i], provider: 'openrouter', divergences: [] },
  { family: 'qwen', match: [/^qwen\//i], provider: 'openrouter', divergences: [] },
  { family: 'glm', match: [/^(z-ai|zhipu)\//i], provider: 'openrouter', divergences: [] },
  { family: 'gpt', match: [/^gpt/i, /openai/i], provider: 'openai', vision: true, divergences: [] },
  { family: 'grok', match: [/^grok/i, /xai/i], provider: 'xai', vision: true, divergences: [] },
  { family: 'qwen', match: [/qwen/i, /dashscope/i], provider: 'dashscope', divergences: [] },
  { family: 'gemini', match: [/^gemini/i, /google/i], provider: 'gemini', vision: true, divergences: [] },
  { family: 'claude', match: [/^claude/i], provider: 'anthropic', vision: true, divergences: [] },
]

/**
 * Profile mode — the A/B toggle for the eval harness. 'generic' strips every
 * divergence (family and provider routing stay: they are plumbing) so the
 * corpus can measure profiled vs generic behavior on the same build.
 */
export type ProfileMode = 'profiled' | 'generic'

export const PROFILE_MODE_ENV = 'ORCHENTRA_MODEL_PROFILES'

export function activeProfileMode(env: Record<string, string | undefined> = process.env): ProfileMode {
  return env[PROFILE_MODE_ENV] === 'generic' ? 'generic' : 'profiled'
}

export function profileFor(
  model: string,
  mode: ProfileMode = 'profiled',
  profiles: readonly ModelProfile[] = MODEL_PROFILES,
): ModelProfile {
  const trimmed = model.trim()
  const matched = profiles.find((p) => p.match.some((re) => re.test(trimmed))) ?? GENERIC_PROFILE
  if (mode === 'profiled') return matched
  // Generic mode: plumbing only — family and route survive, every
  // specialization and its justification records are stripped.
  return {
    family: matched.family,
    match: matched.match,
    provider: matched.provider,
    // vision is plumbing (a factual capability), so it survives generic mode
    // alongside family and route — stripping it would break image sends.
    vision: matched.vision,
    divergences: [],
  }
}

/** Whether the resolved profile for `model` accepts image input. */
export function modelSupportsVision(
  model: string,
  mode: ProfileMode = 'profiled',
  profiles: readonly ModelProfile[] = MODEL_PROFILES,
): boolean {
  return profileFor(model, mode, profiles).vision === true
}

/**
 * Provider gate: throws a clear error if any message carries images but `model`
 * is not vision-capable — a screenshot is never silently dropped onto a text
 * model. A missing model skips the gate (the caller has no model to check).
 * Kept structurally typed (not ChatMessage) to avoid a provider↔profile import
 * cycle.
 */
export function assertVisionSupport(
  messages: readonly { readonly images?: readonly unknown[] }[],
  model?: string,
): void {
  if (!model) return
  const hasImages = messages.some((m) => (m.images?.length ?? 0) > 0)
  if (hasImages && !modelSupportsVision(model)) {
    throw new Error(
      `model "${model}" does not support image input — cannot send an image block. ` +
        `Select a vision-capable model or omit the image.`,
    )
  }
}

/**
 * The justification bar. Every divergence must cite a quirk the snapshot
 * actually recorded (count > 0) on a model this profile matches, plus a
 * non-empty evidence reference. Returns human-readable violations; empty
 * array = registry passes the bar.
 */
export function validateProfileDivergences(
  profiles: readonly ModelProfile[],
  snapshot: Record<string, Partial<Record<QuirkKind, number>>>,
): string[] {
  const violations: string[] = []
  for (const profile of profiles) {
    const justified = new Set(profile.divergences.map((d) => d.field))
    const specialized: Array<[string, boolean]> = [
      ['editDialect', profile.editDialect !== undefined],
      ['toolDescriptions', Object.keys(profile.toolDescriptions ?? {}).length > 0],
      ['systemPromptFragment', Boolean(profile.systemPromptFragment)],
    ]
    for (const [field, isSet] of specialized) {
      if (isSet && !justified.has(field)) {
        violations.push(`${profile.family}.${field}: specialization set without a counter-backed divergence entry`)
      }
    }
    for (const d of profile.divergences) {
      if (!d.evidence.trim()) {
        violations.push(`${profile.family}.${d.field}: divergence has no evidence reference`)
        continue
      }
      const supported = Object.entries(snapshot).some(
        ([model, counts]) => profile.match.some((re) => re.test(model)) && (counts[d.quirk] ?? 0) > 0,
      )
      if (!supported) {
        violations.push(
          `${profile.family}.${d.field}: no recorded '${d.quirk}' counts on any ${profile.family} model — divergence is a vibe, not a measurement`,
        )
      }
    }
  }
  return violations
}

// ── Known-model check (folded in from model-availability.ts) ────────────────
// Stricter than profile matching on purpose: `gpt` alone routes to openai but
// is almost certainly a typo'd alias, so it warns. Same single home now.

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
