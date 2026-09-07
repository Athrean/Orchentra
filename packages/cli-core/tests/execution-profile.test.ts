import { describe, expect, test } from 'bun:test'
import {
  EXECUTION_PROFILE_ENV,
  executionProfilePrompt,
  isExecutionProfile,
  resolveExecutionProfile,
} from '../src/runtime/execution-profile'

describe('execution profiles', () => {
  test('recognizes only the two runtime profiles', () => {
    expect(isExecutionProfile('direct')).toBe(true)
    expect(isExecutionProfile('rlm')).toBe(true)
    expect(isExecutionProfile('trained-rlm')).toBe(false)
    expect(isExecutionProfile(undefined)).toBe(false)
  })

  test('explicit override wins, then env, then config, then direct', () => {
    expect(
      resolveExecutionProfile({ override: 'direct', configured: 'rlm', env: { [EXECUTION_PROFILE_ENV]: 'rlm' } }),
    ).toBe('direct')
    expect(resolveExecutionProfile({ configured: 'direct', env: { [EXECUTION_PROFILE_ENV]: 'rlm' } })).toBe('rlm')
    expect(resolveExecutionProfile({ configured: 'rlm', env: {} })).toBe('rlm')
    expect(resolveExecutionProfile({ env: {} })).toBe('direct')
  })

  test('invalid env values fail loudly so eval labels cannot lie', () => {
    expect(() => resolveExecutionProfile({ env: { [EXECUTION_PROFILE_ENV]: 'typo' } })).toThrow(
      /invalid execution profile/,
    )
  })

  test('direct adds no prompt text; experimental RLM names active and pending capabilities', () => {
    expect(executionProfilePrompt('direct')).toBe('')
    const prompt = executionProfilePrompt('rlm')
    expect(prompt).toContain('RLM EXECUTION PROFILE')
    expect(prompt).toContain('call rlm_execute')
    expect(prompt).toContain('ctx.read(handle, options?)')
    expect(prompt).toContain('Use lm.query for bounded tool-free leaf work')
    expect(prompt).toContain('jobs.resume continues retained same-run child state')
    expect(prompt).toContain('context_read')
    expect(prompt).toContain('existing agent tool remains separate')
  })
})
