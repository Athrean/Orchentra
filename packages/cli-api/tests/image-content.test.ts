import { describe, expect, test } from 'bun:test'
import type { ChatMessage } from '@orchentra/cli-core'
import { toAnthropicMessages } from '../src/anthropic/client'

const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const VISION_MODEL = 'claude-fable-5'
const TEXT_MODEL = 'ollama/llama3'

describe('toAnthropicMessages — image content blocks', () => {
  test('a tool result carrying an image emits an image block inside tool_result.content', () => {
    const msgs: ChatMessage[] = [
      {
        role: 'tool',
        content: 'screenshot saved to /tmp/a.png',
        toolCallId: 'call_1',
        images: [{ data: PNG_1X1, mediaType: 'image/png' }],
      },
    ]
    const out = toAnthropicMessages(msgs, VISION_MODEL)
    expect(out).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'call_1',
            content: [
              { type: 'text', text: 'screenshot saved to /tmp/a.png' },
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG_1X1 } },
            ],
          },
        ],
      },
    ])
  })

  test('a user message carrying an image emits text + image blocks', () => {
    const msgs: ChatMessage[] = [
      { role: 'user', content: 'look at this', images: [{ data: PNG_1X1, mediaType: 'image/png' }] },
    ]
    const out = toAnthropicMessages(msgs, VISION_MODEL)
    expect(out).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'look at this' },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG_1X1 } },
        ],
      },
    ])
  })

  test('throws a clear error when images ride a non-vision model instead of dropping them', () => {
    const msgs: ChatMessage[] = [
      { role: 'user', content: 'see this', images: [{ data: PNG_1X1, mediaType: 'image/png' }] },
    ]
    expect(() => toAnthropicMessages(msgs, TEXT_MODEL)).toThrow(/vision|image input/i)
  })

  test('messages without images are unchanged (string content preserved)', () => {
    const msgs: ChatMessage[] = [{ role: 'user', content: 'hello' }]
    expect(toAnthropicMessages(msgs, VISION_MODEL)).toEqual([{ role: 'user', content: 'hello' }])
  })
})
