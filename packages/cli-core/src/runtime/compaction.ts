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
  const estimate = input.estimator ?? defaultEstimator
  const keep = Math.max(0, input.keepRecent)
  if (input.messages.length <= keep) {
    return {
      messages: input.messages,
      summary: '',
      tokensSaved: 0,
      droppedCount: 0,
      compacted: false,
    }
  }
  const dropIndex = input.messages.length - keep
  const dropped = input.messages.slice(0, dropIndex)
  const recent = input.messages.slice(dropIndex)
  const summary = summarize(dropped)
  const before = estimateMessagesTokens(input.messages, estimate)
  const summaryMsg: ChatMessage = {
    role: 'user',
    content: `[context-compacted] earlier turns summarized:\n${summary}`,
  }
  const next = [summaryMsg, ...recent]
  const after = estimateMessagesTokens(next, estimate)
  return {
    messages: next,
    summary,
    tokensSaved: Math.max(0, before - after),
    droppedCount: dropped.length,
    compacted: true,
  }
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
