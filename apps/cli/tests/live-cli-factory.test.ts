import { describe, expect, test } from 'bun:test'
import { buildToolRegistry } from '../src/live-cli-factory'

describe('buildToolRegistry execution profiles', () => {
  test('direct stays unchanged; RLM advertises context and isolated execution tools', () => {
    const direct = buildToolRegistry({}, {}, 'direct').list()
    const rlm = buildToolRegistry({}, {}, 'rlm').list()

    expect(direct.some((tool) => tool.name.startsWith('context_'))).toBe(false)
    expect(rlm.filter((tool) => tool.name.startsWith('context_')).map((tool) => tool.name)).toEqual([
      'context_list',
      'context_read',
      'context_search',
      'context_store',
    ])
    expect(direct.some((tool) => tool.name === 'rlm_execute')).toBe(false)
    expect(rlm.some((tool) => tool.name === 'rlm_execute')).toBe(true)
  })
})
