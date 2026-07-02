import { describe, test, expect } from 'bun:test'
import { matchHooks } from '../../src/hooks/match'
import type { HookConfig } from '../../src/hooks/types'

const cfg: HookConfig = {
  version: 1,
  hooks: [
    { event: 'pre_tool_use', tools: ['Bash'], command: 'cmd-pre-bash' },
    { event: 'pre_tool_use', tools: ['Read', 'Write'], command: 'cmd-pre-multi' },
    { event: 'post_tool_use', tools: ['*'], command: 'cmd-post-all' },
    { event: 'post_tool_use', tools: ['Bash'], command: 'cmd-post-bash' },
  ],
}

describe('matchHooks', () => {
  test('matches exact tool name on pre_tool_use', () => {
    const out = matchHooks(cfg, 'pre_tool_use', 'Bash')
    expect(out.map((h) => h.command)).toEqual(['cmd-pre-bash'])
  })

  test('matches tool names case-insensitively', () => {
    const out = matchHooks(cfg, 'pre_tool_use', 'bash')
    expect(out.map((h) => h.command)).toEqual(['cmd-pre-bash'])
  })

  test('matches via wildcard *', () => {
    const out = matchHooks(cfg, 'post_tool_use', 'SomethingObscure')
    expect(out.map((h) => h.command)).toEqual(['cmd-post-all'])
  })

  test('returns wildcard AND exact match in declaration order', () => {
    const out = matchHooks(cfg, 'post_tool_use', 'Bash')
    expect(out.map((h) => h.command)).toEqual(['cmd-post-all', 'cmd-post-bash'])
  })

  test('filters by event — pre_tool_use does not match post_tool_use rules', () => {
    const out = matchHooks(cfg, 'pre_tool_use', 'SomethingObscure')
    expect(out).toEqual([])
  })

  test('matches when tool is in a multi-element tools list', () => {
    const out = matchHooks(cfg, 'pre_tool_use', 'Read')
    expect(out.map((h) => h.command)).toEqual(['cmd-pre-multi'])
  })

  test('returns empty when no hook matches', () => {
    const empty: HookConfig = { version: 1, hooks: [] }
    expect(matchHooks(empty, 'pre_tool_use', 'Bash')).toEqual([])
  })

  test('preserves declaration order across multiple matching hooks', () => {
    const cfg2: HookConfig = {
      version: 1,
      hooks: [
        { event: 'pre_tool_use', tools: ['*'], command: 'first' },
        { event: 'pre_tool_use', tools: ['Bash'], command: 'second' },
        { event: 'pre_tool_use', tools: ['*'], command: 'third' },
      ],
    }
    const out = matchHooks(cfg2, 'pre_tool_use', 'Bash')
    expect(out.map((h) => h.command)).toEqual(['first', 'second', 'third'])
  })
})
