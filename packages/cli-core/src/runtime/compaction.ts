import type { ChatMessage } from './provider'

export interface CompactionInput {
  messages: ChatMessage[]
  contextWindowTokens: number
  thresholdRatio: number
  keepRecent: number
  estimator?: TokenEstimator
}

export interface CompactionResult {
  messages: ChatMessage[]
  summary: string
  tokensSaved: number
  droppedCount: number
  compacted: boolean
}

export type TokenEstimator = (text: string) => number

/**
 * Turns a bounded digest of the dropped turns into a concise prose summary.
 * Injected (never imported) so `compaction.ts` stays provider-agnostic and the
 * runtime supplies a real LLM-backed one; it must resolve to a string and may
 * reject — callers fall back to the deterministic summary on any failure.
 */
export type LlmSummarizer = (digest: string) => Promise<string>

// Bounds keep the summarization pass cheap and the resulting prefix small.
// MAX_DIGEST_CHARS caps what we send to the model; MAX_SUMMARY_CHARS caps what
// we splice back into history so a chatty model can't re-inflate the context.
const MAX_DIGEST_CHARS = 6000
const MAX_SUMMARY_CHARS = 2000

export function shouldCompact(
  messages: ChatMessage[],
  contextWindowTokens: number,
  thresholdRatio: number,
  estimator: TokenEstimator = defaultEstimator,
): boolean {
  const used = estimateMessagesTokens(messages, estimator)
  return used >= Math.floor(contextWindowTokens * thresholdRatio)
}

export function compact(input: CompactionInput): CompactionResult {
  const plan = planCompaction(input)
  if (!plan) return noop(input)
  return finalize(input, plan, summarize(plan.dropped))
}

/**
 * Like {@link compact}, but runs a bounded LLM-summarization pass over the
 * dropped turns for a higher-fidelity summary. The retained (live-zone) recent
 * messages are never rewritten or reordered, and the summary is produced once
 * per compaction event, so this keeps the prefix-cache guarantee that
 * `compact` has. Falls back to the deterministic summary when no summarizer is
 * supplied or the call fails/returns blank.
 */
export async function compactWithSummary(
  input: CompactionInput,
  summarizer?: LlmSummarizer,
): Promise<CompactionResult> {
  const plan = planCompaction(input)
  if (!plan) return noop(input)
  return finalize(input, plan, await resolveSummary(plan.dropped, summarizer))
}

interface CompactionPlan {
  dropped: ChatMessage[]
  recent: ChatMessage[]
}

function planCompaction(input: CompactionInput): CompactionPlan | null {
  const keep = Math.max(0, input.keepRecent)
  if (input.messages.length <= keep) return null
  let dropIndex = input.messages.length - keep
  // Pair-safe boundary: the retained window must never open on tool results
  // whose owning assistant tool-call turn was dropped — providers reject the
  // orphaned tool_result. Walk back to keep the whole pair group; keeping
  // more is always safe, dropping the results instead would orphan the
  // assistant's dangling tool calls.
  while (dropIndex > 0 && input.messages[dropIndex]!.role === 'tool') {
    dropIndex--
  }
  if (dropIndex <= 0) return null
  return { dropped: input.messages.slice(0, dropIndex), recent: input.messages.slice(dropIndex) }
}

function finalize(input: CompactionInput, plan: CompactionPlan, summary: string): CompactionResult {
  const estimate = input.estimator ?? defaultEstimator
  const before = estimateMessagesTokens(input.messages, estimate)
  const summaryMsg: ChatMessage = {
    role: 'user',
    content: `[context-compacted] earlier turns summarized:\n${summary}`,
  }
  const next = [summaryMsg, ...plan.recent]
  const after = estimateMessagesTokens(next, estimate)
  return {
    messages: next,
    summary,
    tokensSaved: Math.max(0, before - after),
    droppedCount: plan.dropped.length,
    compacted: true,
  }
}

function noop(input: CompactionInput): CompactionResult {
  return { messages: input.messages, summary: '', tokensSaved: 0, droppedCount: 0, compacted: false }
}

async function resolveSummary(dropped: ChatMessage[], summarizer?: LlmSummarizer): Promise<string> {
  const deterministic = summarize(dropped)
  if (!summarizer) return deterministic
  try {
    const llm = (await summarizer(buildDigest(dropped))).trim()
    return llm ? clip(llm, MAX_SUMMARY_CHARS) : deterministic
  } catch {
    return deterministic
  }
}

function buildDigest(messages: ChatMessage[]): string {
  const lines: string[] = []
  let used = 0
  for (const m of messages) {
    const body = m.content.trim() || toolCallLabel(m)
    if (!body) continue
    const line = `${m.role}: ${body}`
    if (used + line.length > MAX_DIGEST_CHARS) {
      lines.push(clip(line, MAX_DIGEST_CHARS - used))
      break
    }
    lines.push(line)
    used += line.length + 1
  }
  return lines.join('\n')
}

function toolCallLabel(m: ChatMessage): string {
  if (m.role === 'assistant' && m.toolCalls?.length) {
    return `called ${m.toolCalls.map((t) => t.name).join(', ')}`
  }
  if (m.role === 'tool') return `tool result ${m.toolCallId ?? '?'}`
  return ''
}

function summarize(messages: ChatMessage[]): string {
  const toolCalls: string[] = []
  const userSnippets: string[] = []
  const assistantSnippets: string[] = []
  for (const m of messages) {
    if (m.role === 'user') userSnippets.push(clip(m.content, 200))
    else if (m.role === 'assistant') assistantSnippets.push(clip(m.content, 200))
    else if (m.role === 'tool') toolCalls.push(`${m.toolCallId ?? '?'}`)
  }
  const parts: string[] = []
  if (userSnippets.length > 0) {
    parts.push(`user asks: ${userSnippets.join(' | ')}`)
  }
  if (assistantSnippets.length > 0) {
    parts.push(`assistant replied: ${assistantSnippets.join(' | ')}`)
  }
  if (toolCalls.length > 0) {
    parts.push(`tool calls: ${toolCalls.join(', ')}`)
  }
  return parts.join('\n')
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s
  return `${s.slice(0, max)}…`
}

export function estimateMessagesTokens(messages: ChatMessage[], estimator: TokenEstimator = defaultEstimator): number {
  let total = 0
  for (const m of messages) total += estimator(m.content) + 4
  return total
}

export function defaultEstimator(text: string): number {
  return Math.ceil(text.length / 4)
}
