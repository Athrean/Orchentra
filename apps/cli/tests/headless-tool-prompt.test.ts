import { describe, expect, test } from 'bun:test'
import { createHeadlessAskToolUser } from '../src/headless-tool-prompt'
import type { PromptRequest } from '@orchentra/cli-core'

const baseReq: PromptRequest = {
  toolName: 'bash',
  inputJson: '{"command":"npm publish"}',
  suggestedPattern: 'npm publish *',
}

describe('headless tool prompt', () => {
  test('non-TTY stdin auto-denies and never calls readLine', async () => {
    let read = false
    let prompted = false
    const notices: string[] = []
    const ask = createHeadlessAskToolUser({
      isTty: () => false,
      writePrompt: () => {
        prompted = true
      },
      writeNotice: (t) => notices.push(t),
      readLineRaw: async () => {
        read = true
        return null
      },
    })
    const choice = await ask(baseReq)
    expect(choice).toBe('deny')
    expect(read).toBe(false)
    expect(prompted).toBe(false)
    expect(notices[0]).toMatch(/no TTY/i)
  })

  test('TTY stdin maps numeric input to the right choice', async () => {
    const cases: { input: string; expected: ReturnType<typeof Promise.resolve<string>> }[] = []
    void cases
    for (const [text, expected] of [
      ['1', 'allow-once'],
      ['2', 'allow-pattern'],
      ['3', 'deny'],
      ['', 'cancel'],
      ['x', 'cancel'],
    ] as const) {
      const ask = createHeadlessAskToolUser({
        isTty: () => true,
        writePrompt: () => {},
        writeNotice: () => {},
        readLineRaw: async () => text,
      })
      expect(await ask(baseReq)).toBe(expected)
    }
  })

  test('TTY stdin returning null (EOF mid-prompt) maps to cancel', async () => {
    const ask = createHeadlessAskToolUser({
      isTty: () => true,
      writePrompt: () => {},
      writeNotice: () => {},
      readLineRaw: async () => null,
    })
    expect(await ask(baseReq)).toBe('cancel')
  })
})
