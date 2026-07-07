import { randomUUID } from 'node:crypto'
import type { Dispatch, MutableRefObject } from 'react'
import type { RuntimeEvent } from '@orchentra/cli-core'
import { costWarningText, memorySavedText, toolOutputBudgetedText } from '../../renderer'
import type { TuiAction } from '../types'

export interface RuntimeEventRefs {
  readonly streamingIdRef: MutableRefObject<string | null>
  readonly reasoningIdRef: MutableRefObject<string | null>
  readonly toolCallNamesRef: MutableRefObject<Map<string, string>>
}

export function handleRuntimeEvent(event: RuntimeEvent, dispatch: Dispatch<TuiAction>, refs: RuntimeEventRefs): void {
  const { streamingIdRef, reasoningIdRef, toolCallNamesRef } = refs

  switch (event.kind) {
    case 'text': {
      endReasoningIfNeeded(reasoningIdRef, dispatch)
      let id = streamingIdRef.current
      if (id === null) {
        id = randomUUID()
        streamingIdRef.current = id
        dispatch({ type: 'transcript/stream-begin', rowId: id })
      }
      dispatch({ type: 'transcript/stream-append', rowId: id, delta: event.delta })
      break
    }
    case 'reasoning': {
      let id = reasoningIdRef.current
      if (id === null) {
        id = randomUUID()
        reasoningIdRef.current = id
        dispatch({ type: 'transcript/reasoning-begin', rowId: id, startedAt: Date.now() })
      }
      dispatch({ type: 'transcript/reasoning-append', rowId: id, delta: event.delta })
      break
    }
    case 'tool_args_delta': {
      endReasoningIfNeeded(reasoningIdRef, dispatch)
      endAssistantStreamIfNeeded(streamingIdRef, dispatch)
      dispatch({
        type: 'transcript/tool-args-append',
        toolUseId: event.toolUseId,
        toolName: event.toolName,
        delta: event.partialJson,
      })
      break
    }
    case 'tool_use':
      endReasoningIfNeeded(reasoningIdRef, dispatch)
      endAssistantStreamIfNeeded(streamingIdRef, dispatch)
      toolCallNamesRef.current.set(event.call.id, event.call.name)
      dispatch({
        type: 'transcript/tool-args-finalize',
        toolUseId: event.call.id,
        toolName: event.call.name,
        input: typeof event.call.input === 'string' ? event.call.input : JSON.stringify(event.call.input),
      })
      break
    case 'tool_result': {
      const name = toolCallNamesRef.current.get(event.result.id)
      toolCallNamesRef.current.delete(event.result.id)
      dispatch({
        type: 'transcript/push',
        row: {
          kind: 'tool_result',
          id: randomUUID(),
          name,
          preview: event.result.content,
          isError: event.result.isError,
          expanded: false,
        },
      })
      break
    }
    case 'compacted':
      dispatch({
        type: 'transcript/push',
        row: { kind: 'compacted', id: randomUUID(), dropped: event.droppedMessageCount, saved: event.tokensSaved },
      })
      break
    case 'cost_warning':
      dispatch({
        type: 'transcript/push',
        row: {
          kind: 'system',
          id: randomUUID(),
          tone: 'warn',
          text: costWarningText(event.costUsd, event.thresholdUsd, event.limitUsd),
        },
      })
      break
    case 'tool_output_budgeted':
      dispatch({
        type: 'transcript/push',
        row: {
          kind: 'system',
          id: randomUUID(),
          tone: 'info',
          text: toolOutputBudgetedText(event.droppedChars, event.keptChars),
        },
      })
      break
    case 'memory_saved':
      dispatch({
        type: 'transcript/push',
        row: { kind: 'system', id: randomUUID(), tone: 'info', text: memorySavedText(event.id) },
      })
      break
    case 'usage':
      dispatch({ type: 'tokens/set', usage: event.cumulative })
      break
    case 'error':
      if (!event.retryable) {
        dispatch({ type: 'transcript/push', row: { kind: 'error', id: randomUUID(), message: event.message } })
      }
      break
    case 'done':
      endReasoningIfNeeded(reasoningIdRef, dispatch)
      endAssistantStreamIfNeeded(streamingIdRef, dispatch)
      break
  }
}

function endReasoningIfNeeded(ref: MutableRefObject<string | null>, dispatch: Dispatch<TuiAction>): void {
  if (ref.current === null) return
  dispatch({ type: 'transcript/reasoning-end', rowId: ref.current, endedAt: Date.now() })
  ref.current = null
}

function endAssistantStreamIfNeeded(ref: MutableRefObject<string | null>, dispatch: Dispatch<TuiAction>): void {
  if (ref.current === null) return
  ref.current = null
  dispatch({ type: 'transcript/stream-end' })
}
