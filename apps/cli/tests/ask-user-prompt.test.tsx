import { describe, expect, test } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { AskUserPrompt, type AskUserPromptResponse } from '../src/tui/components/AskUserPrompt'

const ESC = String.fromCharCode(27)
const KEY_DOWN = `${ESC}[B`
const KEY_ESC = ESC
const KEY_ENTER = '\r'
const KEY_SPACE = ' '

const tick = (ms = 60): Promise<void> => new Promise<void>((r) => setTimeout(r, ms))

const structuredRequest = {
  question: 'How should I handle this branch?',
  options: [
    { id: 'keep', label: 'Keep it', description: 'Leave the branch alone' },
    { id: 'merge', label: 'Merge it' },
  ],
  allowOther: true,
}

function parseStructured(response: string): AskUserPromptResponse {
  return JSON.parse(response) as AskUserPromptResponse
}

describe('AskUserPrompt — render', () => {
  test('shows question, numbered options, Other fallback, and first option selected', () => {
    const { lastFrame } = render(<AskUserPrompt request={structuredRequest} onSubmit={() => {}} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('How should I handle this branch?')
    expect(frame).toContain('1. Keep it')
    expect(frame).toContain('Leave the branch alone')
    expect(frame).toContain('2. Merge it')
    expect(frame).toContain('3. Other')
    expect(frame).toMatch(/❯\s*1\. Keep it/)
    expect(frame).toContain('Enter select')
  })
})

describe('AskUserPrompt — keyboard', () => {
  test('Enter resolves a single selected option as structured JSON', async () => {
    let submitted = ''
    const { stdin } = render(<AskUserPrompt request={structuredRequest} onSubmit={(value) => (submitted = value)} />)

    stdin.write(KEY_DOWN)
    await tick()
    stdin.write(KEY_ENTER)
    await tick()

    expect(parseStructured(submitted)).toEqual({
      question: 'How should I handle this branch?',
      multiSelect: false,
      selectedOptions: [{ index: 1, id: 'merge', label: 'Merge it' }],
    })
  })

  test('number keys resolve options directly', async () => {
    let submitted = ''
    const { stdin } = render(<AskUserPrompt request={structuredRequest} onSubmit={(value) => (submitted = value)} />)

    stdin.write('2')
    await tick()

    expect(parseStructured(submitted).selectedOptions).toEqual([{ index: 1, id: 'merge', label: 'Merge it' }])
  })

  test('multi-select toggles choices with Space and submits all checked options', async () => {
    let submitted = ''
    const { stdin } = render(
      <AskUserPrompt
        request={{
          ...structuredRequest,
          options: [...structuredRequest.options, { id: 'test', label: 'Run tests' }],
          multiSelect: true,
        }}
        onSubmit={(value) => (submitted = value)}
      />,
    )

    stdin.write(KEY_SPACE)
    await tick()
    stdin.write(KEY_DOWN)
    await tick()
    stdin.write(KEY_DOWN)
    await tick()
    stdin.write(KEY_SPACE)
    await tick()
    stdin.write(KEY_ENTER)
    await tick()

    expect(parseStructured(submitted)).toEqual({
      question: 'How should I handle this branch?',
      multiSelect: true,
      selectedOptions: [
        { index: 0, id: 'keep', label: 'Keep it' },
        { index: 2, id: 'test', label: 'Run tests' },
      ],
    })
  })

  test('Other fallback captures typed text', async () => {
    let submitted = ''
    const { stdin, lastFrame } = render(
      <AskUserPrompt request={structuredRequest} onSubmit={(value) => (submitted = value)} />,
    )

    stdin.write('3')
    await tick()
    expect(lastFrame() ?? '').toContain('Other response')

    stdin.write('Delete the branch')
    await tick()
    stdin.write(KEY_ENTER)
    await tick()

    expect(parseStructured(submitted)).toEqual({
      question: 'How should I handle this branch?',
      multiSelect: false,
      selectedOptions: [],
      other: 'Delete the branch',
    })
  })

  test('free-text requests resolve raw text for legacy callers', async () => {
    let submitted = ''
    const { stdin } = render(
      <AskUserPrompt request={{ question: 'Which branch?' }} rawText onSubmit={(value) => (submitted = value)} />,
    )

    stdin.write('main')
    await tick()
    stdin.write(KEY_ENTER)
    await tick()

    expect(submitted).toBe('main')
  })

  test('Esc cancels with structured JSON for option prompts', async () => {
    let submitted = ''
    const { stdin } = render(<AskUserPrompt request={structuredRequest} onSubmit={(value) => (submitted = value)} />)

    stdin.write(KEY_ESC)
    await tick()

    expect(parseStructured(submitted)).toEqual({ question: 'How should I handle this branch?', cancelled: true })
  })
})
