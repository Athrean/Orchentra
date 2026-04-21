import { test, expect, describe } from 'bun:test'
import { convertMessage, convertTool } from '../src/openai-compat/client'
import type { ChatMessage, ProviderToolSchema } from '@orchentra/cli-core'

describe('convertMessage', () => {
  test('converts user message', () => {
    const msg: ChatMessage = { role: 'user', content: 'hello' }
    const result = convertMessage(msg)
    expect(result).toEqual({ role: 'user', content: 'hello' })
  })

  test('converts assistant message with text', () => {
    const msg: ChatMessage = { role: 'assistant', content: 'response' }
    const result = convertMessage(msg)
    expect(result).toEqual({ role: 'assistant', content: 'response' })
  })

  test('converts assistant message with tool calls', () => {
    const msg: ChatMessage = {
      role: 'assistant',
      content: '',
      toolCalls: [{ id: 'call_1', name: 'bash', input: { command: 'ls' } }],
    }
    const result = convertMessage(msg)
    expect(result.role).toBe('assistant')
    expect(result.tool_calls).toHaveLength(1)
    expect(result.tool_calls?.[0]).toEqual({
      id: 'call_1',
      type: 'function',
      function: { name: 'bash', arguments: '{"command":"ls"}' },
    })
  })

  test('converts tool result message', () => {
    const msg: ChatMessage = { role: 'tool', content: 'file.txt', toolCallId: 'call_1' }
    const result = convertMessage(msg)
    expect(result).toEqual({ role: 'tool', content: 'file.txt', tool_call_id: 'call_1' })
  })
})

describe('convertTool', () => {
  test('converts tool schema to OpenAI function format', () => {
    const tool: ProviderToolSchema = {
      name: 'bash',
      description: 'Run a bash command',
      inputSchema: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
    }
    const result = convertTool(tool)
    expect(result).toEqual({
      type: 'function',
      function: {
        name: 'bash',
        description: 'Run a bash command',
        parameters: tool.inputSchema,
      },
    })
  })
})
