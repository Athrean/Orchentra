import { describe, expect, test } from 'bun:test'
import { reviewCommentsOutputs } from '../../src/commands/builtin/pr'

const pr = { number: 42, title: 'feat: cli context transparency', html_url: 'https://github.com/o/r/pull/42' }

describe('reviewCommentsOutputs', () => {
  test('notes when a PR has no review comments', () => {
    const outputs = reviewCommentsOutputs(pr, [])
    expect(outputs).toEqual([{ kind: 'note', tone: 'info', text: 'No review comments on PR #42.' }])
  })

  test('summarises the PR and lists each comment with its url', () => {
    const outputs = reviewCommentsOutputs(pr, [
      { id: 1, body: '  nit: rename this  ', html_url: 'https://github.com/o/r/pull/42#c1' },
      { id: 2, body: 'this branch is untested', html_url: 'https://github.com/o/r/pull/42#c2' },
    ])

    const card = outputs[0]
    expect(card.kind).toBe('card')
    if (card.kind !== 'card') throw new Error('expected card')
    expect(card.subtitle).toBe('#42 feat: cli context transparency')
    expect(card.sections[0]!.rows.find((r) => r.key === 'Comments')?.value).toBe('2')
    expect(card.sections[0]!.rows.find((r) => r.key === 'URL')?.value).toBe('https://github.com/o/r/pull/42')

    expect(outputs[1]).toEqual({ kind: 'text', text: '1. nit: rename this\n   https://github.com/o/r/pull/42#c1' })
    expect(outputs[2]).toEqual({
      kind: 'text',
      text: '2. this branch is untested\n   https://github.com/o/r/pull/42#c2',
    })
  })
})
