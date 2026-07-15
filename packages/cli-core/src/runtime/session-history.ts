import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { RuntimeEvent, ToolCall } from './events'
import type { ChatMessage } from './provider'
import { replaySession, type SessionRecord } from './session'

export interface RetrievedToolOutput {
  toolCallId: string
  content: string
  originalChars: number
  keptChars: number
  droppedChars: number
}

export class SessionRetrievalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SessionRetrievalError'
  }
}

export class SessionRetrieval {
  constructor(private readonly path: string) {}

  async retrieveToolOutput(toolCallId: string): Promise<RetrievedToolOutput> {
    const records = await replaySession(this.path)
    const budgeted = records
      .map((r) => r.event)
      .filter((e): e is Extract<RuntimeEvent, { kind: 'tool_output_budgeted' }> => e.kind === 'tool_output_budgeted')
      .find((e) => e.toolCallId === toolCallId)
    if (!budgeted) throw new SessionRetrievalError(`No trimmed tool output found for: ${toolCallId}`)

    const toolResult = records
      .map((r) => r.event)
      .filter((e): e is Extract<RuntimeEvent, { kind: 'tool_result' }> => e.kind === 'tool_result')
      .find((e) => e.result.id === toolCallId)
    if (toolResult) {
      return {
        toolCallId,
        content: toolResult.result.content,
        originalChars: budgeted.originalChars,
        keptChars: budgeted.keptChars,
        droppedChars: budgeted.droppedChars,
      }
    }

    const recovered = await readRecoveredOutput(this.path, toolCallId)
    if (recovered !== null) {
      return {
        toolCallId,
        content: recovered,
        originalChars: budgeted.originalChars,
        keptChars: budgeted.keptChars,
        droppedChars: budgeted.droppedChars,
      }
    }

    throw new SessionRetrievalError(`Original output missing for trimmed tool call: ${toolCallId}`)
  }

  async reconstructBeforeCompaction(ordinal: number): Promise<ChatMessage[]> {
    if (!Number.isInteger(ordinal) || ordinal < 1) {
      throw new SessionRetrievalError('Compaction ordinal must be a positive integer.')
    }

    const records = await replaySession(this.path)
    let seen = 0
    const before: SessionRecord[] = []
    for (const record of records) {
      if (record.event.kind === 'compacted') {
        seen++
        if (seen === ordinal) return hydrateMessages(before)
      }
      before.push(record)
    }

    throw new SessionRetrievalError(`Compaction not found: ${ordinal}`)
  }
}

async function readRecoveredOutput(sessionPath: string, toolCallId: string): Promise<string | null> {
  const fileName = sessionPath.slice(sessionPath.lastIndexOf('/') + 1)
  if (!fileName.endsWith('.jsonl')) return null
  const sessionId = fileName.slice(0, -'.jsonl'.length)
  const resultPath = join(dirname(sessionPath), sessionId, 'tool-results', `${toolCallId}.txt`)
  try {
    return await readFile(resultPath, 'utf8')
  } catch {
    return null
  }
}

function hydrateMessages(records: readonly SessionRecord[]): ChatMessage[] {
  const messages: ChatMessage[] = []
  let assistantText = ''
  let assistantToolCalls: ToolCall[] = []

  const flushAssistant = (): void => {
    if (assistantText.length === 0 && assistantToolCalls.length === 0) return
    messages.push({
      role: 'assistant',
      content: assistantText,
      toolCalls: assistantToolCalls.length > 0 ? assistantToolCalls : undefined,
    })
    assistantText = ''
    assistantToolCalls = []
  }

  for (const record of records) {
    const event = record.event
    switch (event.kind) {
      case 'user_message':
        flushAssistant()
        messages.push({ role: 'user', content: event.content })
        break
      case 'text':
        assistantText += event.delta
        break
      case 'tool_use':
        assistantToolCalls.push(event.call)
        break
      case 'tool_result':
        flushAssistant()
        messages.push({ role: 'tool', content: event.result.content, toolCallId: event.result.id })
        break
    }
  }
  flushAssistant()
  return messages
}
