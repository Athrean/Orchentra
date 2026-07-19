import { describe, expect, test } from 'bun:test'
import type { ChatMessage, ProviderRequest } from '@orchentra/cli-core'
import { toAnthropicMessages } from '../src/anthropic/client'
import { buildGeminiRequest } from '../src/gemini/client'
import { convertMessage, convertMessages } from '../src/openai-compat/client'

const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const VISION_MODEL = 'claude-fable-5'
const TEXT_MODEL = 'ollama/llama3'

function req(messages: ChatMessage[], model: string): ProviderRequest {
  return { systemStatic: '', systemDynamic: '', messages, tools: [], model, maxOutputTokens: 100 }
}

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

describe('buildGeminiRequest — inlineData image parts', () => {
  test('a tool result with an image gets an inlineData part alongside its functionResponse', () => {
    const body = buildGeminiRequest(
      req(
        [
          {
            role: 'tool',
            content: 'screenshot saved',
            toolCallId: 'shot',
            images: [{ data: PNG_1X1, mediaType: 'image/png' }],
          },
        ],
        'gemini-2.0-flash',
      ),
      8192,
    )
    const toolContent = body.contents[0]!
    expect(toolContent.role).toBe('user')
    const inline = toolContent.parts.find((p) => p.inlineData)
    expect(inline?.inlineData).toEqual({ mimeType: 'image/png', data: PNG_1X1 })
    // functionResponse still present.
    expect(toolContent.parts.some((p) => p.functionResponse)).toBe(true)
  })

  test('throws a clear error when images ride a non-vision model', () => {
    expect(() =>
      buildGeminiRequest(
        req([{ role: 'user', content: 'see', images: [{ data: PNG_1X1, mediaType: 'image/png' }] }], TEXT_MODEL),
        8192,
      ),
    ).toThrow(/vision|image input/i)
  })
})

describe('OpenAI-compat — image_url content parts', () => {
  test('a user message with an image becomes array content with a data-URL image_url part', () => {
    const out = convertMessage({
      role: 'user',
      content: 'look',
      images: [{ data: PNG_1X1, mediaType: 'image/png' }],
    })
    expect(out).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'look' },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${PNG_1X1}` } },
      ],
    })
  })

  test('a tool result with an image expands into the tool message plus a trailing user image message', () => {
    // OpenAI tool messages are string-only, so the image cannot ride the tool
    // message — it follows as a user message with image_url parts.
    const out = convertMessages([
      {
        role: 'tool',
        content: 'screenshot saved',
        toolCallId: 'shot',
        images: [{ data: PNG_1X1, mediaType: 'image/png' }],
      },
    ])
    expect(out).toEqual([
      { role: 'tool', content: 'screenshot saved', tool_call_id: 'shot' },
      {
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: `data:image/png;base64,${PNG_1X1}` } }],
      },
    ])
  })

  test('messages without images pass through unchanged', () => {
    expect(convertMessages([{ role: 'user', content: 'hi' }])).toEqual([{ role: 'user', content: 'hi' }])
  })
})
