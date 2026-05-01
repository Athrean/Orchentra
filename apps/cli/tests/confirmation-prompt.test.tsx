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

  test('Esc resolves with cancel', async () => {
    let chosen: PromptChoice | null = null
    const { stdin } = renderPrompt({ onChoose: (c) => (chosen = c) })
    stdin.write(KEY_ESC)
    await tick()
    expect(chosen).toBe('cancel')
  })
})
