import { describe, expect, test } from 'bun:test'
import type { AskUserRequest, ToolContext } from '@orchentra/cli-core'
import { askUserTool } from '../src/tools/ask-user-tool'

const baseCtx: ToolContext = { sessionId: 'test', cwd: '/tmp' }

describe('askUserTool', () => {
  test('keeps legacy prompt requests as free-text questions', async () => {
    let seen: string | AskUserRequest | null = null
    const result = await askUserTool.execute(
      { prompt: 'Which branch?' },
      {
        ...baseCtx,
        askUser: async (request) => {
          seen = request
          return 'main'
        },
      },
    )

    expect(result).toEqual({ content: 'main', isError: false })
    expect(seen).toBe('Which branch?')
  })

  test('passes structured option requests through to the runtime askUser hook', async () => {
    let seen: string | AskUserRequest | null = null
    const payload = JSON.stringify({
      selectedOptions: [{ index: 1, id: 'merge', label: 'Merge it' }],
    })

    const result = await askUserTool.execute(
      {
        question: 'How should I handle the branch?',
        options: [
          { id: 'keep', label: 'Keep it', description: 'Leave the branch alone' },
          { id: 'merge', label: 'Merge it' },
        ],
        multiSelect: false,
      },
      {
        ...baseCtx,
        askUser: async (request) => {
          seen = request
          return payload
        },
      },
    )

    expect(result).toEqual({ content: payload, isError: false })
    expect(seen).toEqual({
      question: 'How should I handle the branch?',
      options: [
        { id: 'keep', label: 'Keep it', description: 'Leave the branch alone' },
        { id: 'merge', label: 'Merge it' },
      ],
      multiSelect: false,
      allowOther: true,
    })
  })

  test('supports multi-select structured requests', async () => {
    let seen: AskUserRequest | string | null = null
    const result = await askUserTool.execute(
      {
        question: 'Which checks should I run?',
        options: [{ label: 'Unit tests' }, { label: 'Typecheck' }, { label: 'Lint' }],
        multiSelect: true,
        allowOther: false,
      },
      {
        ...baseCtx,
        askUser: async (request) => {
          seen = request
          return '{"selectedOptions":[{"index":0,"label":"Unit tests"},{"index":2,"label":"Lint"}]}'
        },
      },
    )

    expect(result.isError).toBe(false)
    expect(seen).toEqual({
      question: 'Which checks should I run?',
      options: [{ label: 'Unit tests' }, { label: 'Typecheck' }, { label: 'Lint' }],
      multiSelect: true,
      allowOther: false,
    })
  })

  test('rejects structured requests with fewer than two or more than four options', async () => {
    const one = await askUserTool.execute(
      { question: 'Pick one', options: [{ label: 'Only' }] },
      {
        ...baseCtx,
        askUser: async () => 'unused',
      },
    )
    const five = await askUserTool.execute(
      {
        question: 'Pick one',
        options: [{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }, { label: 'E' }],
      },
      {
        ...baseCtx,
        askUser: async () => 'unused',
      },
    )

    expect(one.isError).toBe(true)
    expect(one.content).toContain('2-4 options')
    expect(five.isError).toBe(true)
    expect(five.content).toContain('2-4 options')
  })

  test('rejects empty questions and empty option labels', async () => {
    const noQuestion = await askUserTool.execute(
      { question: '', options: [{ label: 'A' }, { label: 'B' }] },
      { ...baseCtx, askUser: async () => 'unused' },
    )
    const emptyLabel = await askUserTool.execute(
      { question: 'Pick one', options: [{ label: 'A' }, { label: ' ' }] },
      { ...baseCtx, askUser: async () => 'unused' },
    )

    expect(noQuestion.isError).toBe(true)
    expect(noQuestion.content).toContain('question or prompt is required')
    expect(emptyLabel.isError).toBe(true)
    expect(emptyLabel.content).toContain('option label')
  })
})
