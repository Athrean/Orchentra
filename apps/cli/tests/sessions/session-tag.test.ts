import { describe, expect, test } from 'bun:test'
import { sessionTag } from '../../src/sessions/session-tag'

function jsonl(...records: unknown[]): string {
  return records.map((r) => JSON.stringify(r)).join('\n') + '\n'
}

describe('sessionTag', () => {
  test('derives a short slug from the first user prompt', () => {
    const text = jsonl(
      { event: { kind: 'user_message', content: 'Fix the flaky resume test on CI' } },
      { event: { kind: 'text', delta: 'sure' } },
    )
    expect(sessionTag(text)).toBe('fix-the-flaky-resume-test')
  })

  test('lowercases, collapses punctuation, and caps length', () => {
    const text = jsonl({ event: { kind: 'user_message', content: '  Add @-file  Suggestions!! (gitignore-aware)  ' } })
    expect(sessionTag(text)).toBe('add-file-suggestions-gitignore')
  })

  test('ignores non-user events before the first user prompt', () => {
    const text = jsonl(
      { event: { kind: 'text', delta: 'assistant preamble' } },
      { event: { kind: 'user_message', content: 'hello world' } },
    )
    expect(sessionTag(text)).toBe('hello-world')
  })

  test('returns null when there is no user prompt', () => {
    const text = jsonl({ event: { kind: 'text', delta: 'nothing here' } })
    expect(sessionTag(text)).toBeNull()
  })

  test('returns null for an empty or whitespace-only prompt', () => {
    expect(sessionTag(jsonl({ event: { kind: 'user_message', content: '   ' } }))).toBeNull()
    expect(sessionTag('')).toBeNull()
  })

  test('skips malformed lines without throwing', () => {
    const text = 'not json\n' + jsonl({ event: { kind: 'user_message', content: 'recover gracefully' } })
    expect(sessionTag(text)).toBe('recover-gracefully')
  })
})
