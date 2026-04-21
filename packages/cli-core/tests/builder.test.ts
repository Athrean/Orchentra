import { test, expect, describe } from 'bun:test'
import { buildPatternText, buildResolutionText } from '../src/memory/builder'

describe('buildPatternText', () => {
  test('includes required fields', () => {
    const text = buildPatternText({
      workflowName: 'ci',
      branch: 'main',
      rootCause: 'timeout',
    })
    expect(text).toContain('workflow: ci')
    expect(text).toContain('branch: main')
    expect(text).toContain('root_cause: timeout')
  })

  test('omits optional fields when not provided', () => {
    const text = buildPatternText({
      workflowName: 'ci',
      branch: 'main',
      rootCause: 'timeout',
    })
    expect(text).not.toContain('summary:')
    expect(text).not.toContain('failure_type:')
  })

  test('includes optional fields when provided', () => {
    const text = buildPatternText({
      workflowName: 'ci',
      branch: 'main',
      rootCause: 'timeout',
      summary: 'tests flaked',
      failureType: 'flaky_test',
    })
    expect(text).toContain('summary: tests flaked')
    expect(text).toContain('failure_type: flaky_test')
  })
})

describe('buildResolutionText', () => {
  test('returns provided fix', () => {
    expect(buildResolutionText('increase timeout')).toBe('increase timeout')
  })

  test('returns fallback when undefined', () => {
    expect(buildResolutionText(undefined)).toBe('No resolution recorded')
  })
})
