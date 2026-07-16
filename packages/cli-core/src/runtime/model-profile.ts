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

export interface ModelProfile {
  /** Model family (claude, gpt, gemini, …) — the specialization key. */
  readonly family: string
  /** Model-id patterns this profile matches. First matching profile wins. */
  readonly match: readonly RegExp[]
  /** Provider route for matched models. */
  readonly provider: ProviderName
  /** Counter-backed deviations from generic behavior. Empty = generic. */
  readonly divergences: readonly ProfileDivergence[]
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
  { family: 'claude', match: [/^anthropic\//i], provider: 'openrouter', divergences: [] },
  { family: 'gpt', match: [/^openai\//i], provider: 'openrouter', divergences: [] },
  { family: 'gemini', match: [/^google\//i], provider: 'openrouter', divergences: [] },
  { family: 'grok', match: [/^x-ai\//i], provider: 'openrouter', divergences: [] },
  { family: 'mistral', match: [/^mistralai\//i], provider: 'openrouter', divergences: [] },
  { family: 'deepseek', match: [/^deepseek\//i], provider: 'openrouter', divergences: [] },
  { family: 'qwen', match: [/^qwen\//i], provider: 'openrouter', divergences: [] },
  { family: 'glm', match: [/^(z-ai|zhipu)\//i], provider: 'openrouter', divergences: [] },
  { family: 'gpt', match: [/^gpt/i, /openai/i], provider: 'openai', divergences: [] },
  { family: 'grok', match: [/^grok/i, /xai/i], provider: 'xai', divergences: [] },
  { family: 'qwen', match: [/qwen/i, /dashscope/i], provider: 'dashscope', divergences: [] },
  { family: 'gemini', match: [/^gemini/i, /google/i], provider: 'gemini', divergences: [] },
  { family: 'claude', match: [/^claude/i], provider: 'anthropic', divergences: [] },
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
  return mode === 'generic' && matched.divergences.length > 0 ? { ...matched, divergences: [] } : matched
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
