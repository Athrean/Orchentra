import { describe, expect, test } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { ConfirmationPrompt, type PromptChoice, type PromptRequest } from '../src/tui/components/ConfirmationPrompt'

const baseReq: PromptRequest = {
  toolLabel: 'Bash command',
  commandLine: '$ gh issue list --state open',
  context: 'in /Users/x/repo',
  allowPattern: 'gh issue *',
}

const ESC = String.fromCharCode(27)
const KEY_DOWN = `${ESC}[B`
const KEY_UP = `${ESC}[A`
const KEY_ESC = ESC
const KEY_ENTER = '\r'

const tick = (ms = 60): Promise<void> => new Promise<void>((r) => setTimeout(r, ms))

function renderPrompt(opts: { onChoose?: (c: PromptChoice) => void } = {}): ReturnType<typeof render> {
  const onChoose = opts.onChoose ?? ((): void => {})
  return render(<ConfirmationPrompt request={baseReq} onChoose={onChoose} />)
}

describe('ConfirmationPrompt — render', () => {
  test('shows header, command line, context, and three numbered options with first selected', () => {
    const { lastFrame } = renderPrompt()
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Bash command')
    expect(frame).toContain('$ gh issue list --state open')
    expect(frame).toContain('in /Users/x/repo')
    expect(frame).toContain('Do you want to proceed?')
    expect(frame).toContain('1. Yes')
    expect(frame).toContain('2. Yes, and allow this pattern')
    expect(frame).toContain('3. No')
    expect(frame).toMatch(/❯\s*1\. Yes/)
    expect(frame).toContain('Esc to cancel')
  })

  test('renders a diff in place of the raw command line when a diff is supplied', () => {
    const { lastFrame } = render(
      <ConfirmationPrompt
        request={{
          ...baseReq,
          toolLabel: 'edit_file call',
          commandLine: '{"path":"src/app.ts","old_string":"a","new_string":"b"}',
          diff: 'diff --git a/src/app.ts b/src/app.ts\n-a\n+b',
        }}
        onChoose={() => {}}
      />,
    )
    const frame = lastFrame() ?? ''
    // The colourised diff is shown; the raw JSON blob is not.
    expect(frame).toContain('src/app.ts')
    expect(frame).toMatch(/add\s+\+b/)
    expect(frame).toMatch(/del\s+-a/)
    expect(frame).not.toContain('{"path"')
  })

  test('omits the context line when not provided', () => {
    const { lastFrame } = render(
      <ConfirmationPrompt request={{ ...baseReq, context: undefined }} onChoose={() => {}} />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).not.toContain('in /Users/x/repo')
  })
})

describe('ConfirmationPrompt — keyboard', () => {
  test('Down arrow moves the highlight to option 2', async () => {
    const { stdin, lastFrame } = renderPrompt()
    stdin.write(KEY_DOWN)
    await tick()
    const frame = lastFrame() ?? ''
    expect(frame).toMatch(/❯\s*2\. Yes, and allow this pattern/)
    expect(frame).not.toMatch(/❯\s*1\. Yes/)
  })

  test('Up arrow from the first row wraps to option 3', async () => {
    const { stdin, lastFrame } = renderPrompt()
    stdin.write(KEY_UP)
    await tick()
    const frame = lastFrame() ?? ''
    expect(frame).toMatch(/❯\s*3\. No/)
  })

  test('Enter resolves with the highlighted choice', async () => {
    let chosen: PromptChoice | null = null
    const { stdin } = renderPrompt({ onChoose: (c) => (chosen = c) })
    stdin.write(KEY_DOWN)
    await tick()
    stdin.write(KEY_ENTER)
    await tick()
    expect(chosen).toBe('allow-pattern')
  })

  test('number keys 1/2/3 resolve directly', () => {
    const calls: PromptChoice[] = []
    {
      const { stdin } = renderPrompt({ onChoose: (c) => calls.push(c) })
      stdin.write('1')
    }
    {
      const { stdin } = renderPrompt({ onChoose: (c) => calls.push(c) })
      stdin.write('2')
    }
    {
      const { stdin } = renderPrompt({ onChoose: (c) => calls.push(c) })
      stdin.write('3')
    }
    expect(calls).toEqual(['allow-once', 'allow-pattern', 'deny'])
  })

  test('deny-banner mode renders the reason and resolves with deny on any key', async () => {
    let chosen: PromptChoice | null = null
    const { stdin, lastFrame } = render(
      <ConfirmationPrompt
        request={{ ...baseReq, denyBanner: 'destructive pattern: rm -rf /' }}
        onChoose={(c): void => {
          chosen = c
        }}
      />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Blocked')
    expect(frame).toContain('destructive pattern: rm -rf /')
    expect(frame).not.toContain('1. Yes')
    expect(frame).toContain('Press any key')
    stdin.write(' ')
    await tick()
    expect(chosen).toBe('deny')
  })

  test('Esc resolves with cancel', async () => {
    let chosen: PromptChoice | null = null
    const { stdin } = renderPrompt({ onChoose: (c) => (chosen = c) })
    stdin.write(KEY_ESC)
    await tick()
    expect(chosen).toBe('cancel')
  })

  test('ctrl+e calls onExplain when provided', async () => {
    let explained = false
    const { stdin } = render(
      <ConfirmationPrompt
        request={baseReq}
        onChoose={(): void => {}}
        onExplain={() => {
          explained = true
        }}
      />,
    )
    stdin.write('\x05')
    await tick()
    expect(explained).toBe(true)
  })

  test('ctrl+e is a no-op when onExplain is omitted', async () => {
    let chosen: PromptChoice | null = null
    const { stdin } = render(
      <ConfirmationPrompt
        request={baseReq}
        onChoose={(c): void => {
          chosen = c
        }}
      />,
    )
    stdin.write('\x05')
    await tick()
    expect(chosen).toBeNull()
  })
})
