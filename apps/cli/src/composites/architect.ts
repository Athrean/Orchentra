import { planLevelPrompt, terseModePrompt, type PlanLevel, type TerseMode } from '@orchentra/cli-core'
import type { LlmCaller } from './scan'

export interface Alternative {
  name: string
  tradeoff: string
}

export interface ScaffoldEntry {
  path: string
  purpose: string
}

export interface ArchitectPlan {
  recommendedStack: string
  rationale: string
  alternatives: Alternative[]
  architecture: string
  scaffold: ScaffoldEntry[]
  verification: string[]
  model: string
  tokensIn: number
  tokensOut: number
}

const SYSTEM_PROMPT = [
  'You are a lazy senior architect. Turn the need into the smallest design that holds.',
  'Lean ladder (stop at the first rung that works): does it need to exist? → stdlib → native platform → already-installed dependency → one line → minimum custom code.',
  'Prefer the fewest moving parts. Never add a dependency for what a few lines cover. No speculative abstractions.',
  'Return ONLY a JSON object. No prose, no markdown outside the object.',
  'Shape: { recommendedStack: string, rationale: string, alternatives: { name: string, tradeoff: string }[], architecture: string, scaffold: { path: string, purpose: string }[], verification: string[] }.',
  'recommendedStack: the chosen approach in one line. rationale: why it is the leanest that works.',
  'alternatives: 1-3 named, each with its tradeoff. architecture: how the pieces fit, terse.',
  'scaffold: the files/dirs to create with a one-line purpose each — propose, do not assume they exist.',
  'verification: concrete checks that prove it works (tests/commands).',
].join('\n')

export interface ArchitectOptions {
  need: string
  llm: LlmCaller
  terseMode?: TerseMode
  planLevel?: PlanLevel
  spinePrompt?: string
}

export async function architect(opts: ArchitectOptions): Promise<ArchitectPlan | { error: string }> {
  const need = opts.need.trim()
  if (need.length === 0) return { error: 'describe what to build: /plan <need>' }

  const depth = planLevelPrompt(opts.planLevel ?? 'plus')
  const terse = opts.terseMode ? terseModePrompt(opts.terseMode) : ''
  const systemPrompt = [SYSTEM_PROMPT, opts.spinePrompt, depth, terse].filter(Boolean).join('\n')

  const llm = await opts.llm({ systemPrompt, userPrompt: need })
  const plan = parsePlan(llm.text)
  if (!plan) return { error: `LLM returned malformed JSON: ${llm.text.slice(0, 200)}` }
  return { ...plan, model: llm.model, tokensIn: llm.tokensIn, tokensOut: llm.tokensOut }
}

type ParsedPlan = Omit<ArchitectPlan, 'model' | 'tokensIn' | 'tokensOut'>

function parsePlan(text: string): ParsedPlan | null {
  // The model is asked for a bare JSON object; tolerate ```json fences and stray prose.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : text
  let obj: unknown
  try {
    obj = JSON.parse(candidate.trim())
  } catch {
    return null
  }
  return isPlan(obj) ? obj : null
}

function isPlan(x: unknown): x is ParsedPlan {
  if (typeof x !== 'object' || x === null) return false
  const o = x as Record<string, unknown>
  return (
    typeof o.recommendedStack === 'string' &&
    typeof o.rationale === 'string' &&
    Array.isArray(o.alternatives) &&
    o.alternatives.every(isAlternative) &&
    typeof o.architecture === 'string' &&
    Array.isArray(o.scaffold) &&
    o.scaffold.every(isScaffold) &&
    Array.isArray(o.verification) &&
    o.verification.every((v) => typeof v === 'string')
  )
}

function isAlternative(x: unknown): x is Alternative {
  if (typeof x !== 'object' || x === null) return false
  const o = x as Record<string, unknown>
  return typeof o.name === 'string' && typeof o.tradeoff === 'string'
}

function isScaffold(x: unknown): x is ScaffoldEntry {
  if (typeof x !== 'object' || x === null) return false
  const o = x as Record<string, unknown>
  return typeof o.path === 'string' && typeof o.purpose === 'string'
}
