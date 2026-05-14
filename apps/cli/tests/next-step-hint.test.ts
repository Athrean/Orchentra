import { describe, expect, test } from 'bun:test'
import { renderNextStepHint } from '../src/render/next-step-hint'

describe('renderNextStepHint', () => {
  test('returns the locked copy for `summarize-completed`', () => {
    const out = renderNextStepHint({ id: 'summarize-completed' })
    expect(out).toBe('Run /fix to apply this recommendation.')
  })

  test('interpolates the runId for `triage-completed`', () => {
    const out = renderNextStepHint({ id: 'triage-completed', runId: 12345 })
    expect(out).toBe('Run /summarize 12345 to extract root cause.')
  })

  test('emits no emoji and no `Tip:` prefix', () => {
    // The renderer is the single source of truth for this copy. If anyone
    // adds decoration in the future, this guard fails on every hint id.
    const samples = [
      renderNextStepHint({ id: 'summarize-completed' }),
      renderNextStepHint({ id: 'triage-completed', runId: 1 }),
    ]
    for (const s of samples) {
      expect(s.startsWith('Tip:')).toBe(false)
      // No common emoji code points; the line must read like plain CLI text.
      // eslint-disable-next-line no-control-regex
      expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(s)).toBe(false)
      expect(s).toBe(s.trim())
    }
  })
})
