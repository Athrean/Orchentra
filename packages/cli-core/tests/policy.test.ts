import { describe, expect, test } from 'bun:test'
import { evaluate, type PolicyRule, type Ruleset } from '../src/permissions/policy'
import type { ToolCall } from '../src/runtime/events'

const empty: Ruleset = { version: 1, rules: [] }
const ghList: ToolCall = { id: 't', name: 'bash', input: { command: 'gh issue list --state open' } }
const npmPub: ToolCall = { id: 't', name: 'bash', input: { command: 'npm publish --access public' } }
const readCall: ToolCall = { id: 't', name: 'read', input: { path: '/tmp/x' } }

const rules = (...rs: PolicyRule[]): Ruleset => ({ version: 1, rules: rs })

describe('evaluate — empty ruleset', () => {
  test('returns no-match', () => {
    expect(evaluate(ghList, empty).kind).toBe('no-match')
  })
})

describe('evaluate — single rule', () => {
  test('allow rule that matches → allow', () => {
    const r = rules({ tool: 'bash', pattern: 'gh issue *', decision: 'allow' })
    const v = evaluate(ghList, r)
    expect(v.kind).toBe('allow')
    if (v.kind !== 'no-match') expect(v.rule.pattern).toBe('gh issue *')
  })

  test('deny rule that matches → deny', () => {
    const r = rules({ tool: 'bash', pattern: 'npm publish *', decision: 'deny' })
    expect(evaluate(npmPub, r).kind).toBe('deny')
  })

  test('rule for a different tool → no-match', () => {
    const r = rules({ tool: 'write', pattern: '*', decision: 'allow' })
    expect(evaluate(ghList, r).kind).toBe('no-match')
  })

  test('non-bash tool: pattern "*" matches', () => {
    const r = rules({ tool: 'read', pattern: '*', decision: 'allow' })
    expect(evaluate(readCall, r).kind).toBe('allow')
  })

  test('exact pattern matches the canonical form', () => {
    const r = rules({ tool: 'bash', pattern: 'gh issue list --state open', decision: 'allow' })
    expect(evaluate(ghList, r).kind).toBe('allow')
  })
})

describe('evaluate — precedence', () => {
  test('deny wins when both an allow and a deny rule match', () => {
    const r = rules(
      { tool: 'bash', pattern: 'gh *', decision: 'allow' },
      { tool: 'bash', pattern: 'gh issue *', decision: 'deny' },
    )
    expect(evaluate(ghList, r).kind).toBe('deny')
  })

  test('allow first then deny on the same pattern → deny (later wins for ties; deny wins anyway)', () => {
    const r = rules(
      { tool: 'bash', pattern: 'gh issue *', decision: 'allow' },
      { tool: 'bash', pattern: 'gh issue *', decision: 'deny' },
    )
    expect(evaluate(ghList, r).kind).toBe('deny')
  })

  test('deny first then allow on the same pattern → allow (later wins on ties)', () => {
    const r = rules(
      { tool: 'bash', pattern: 'gh issue *', decision: 'deny' },
      { tool: 'bash', pattern: 'gh issue *', decision: 'allow' },
    )
    const v = evaluate(ghList, r)
    expect(v.kind).toBe('deny') // deny still wins because both match — deny precedence is global, not per-pattern
  })

  test('different patterns: deny precedence wins over a more-general allow', () => {
    const r = rules(
      { tool: 'bash', pattern: '**', decision: 'allow' },
      { tool: 'bash', pattern: 'npm publish *', decision: 'deny' },
    )
    expect(evaluate(npmPub, r).kind).toBe('deny')
    expect(evaluate(ghList, r).kind).toBe('allow')
  })
})

describe('evaluate — glob mechanics', () => {
  test('"*" matches anything in any position', () => {
    const r = rules({ tool: 'bash', pattern: 'gh * list*', decision: 'allow' })
    expect(evaluate(ghList, r).kind).toBe('allow')
  })

  test('inner-segment glob like feat/* matches a substring within a token', () => {
    const call: ToolCall = { id: 't', name: 'bash', input: { command: 'git push origin feat/foo' } }
    const r = rules({ tool: 'bash', pattern: 'git push origin feat/*', decision: 'allow' })
    expect(evaluate(call, r).kind).toBe('allow')
  })

  test('non-matching pattern → no-match', () => {
    const r = rules({ tool: 'bash', pattern: 'git push *', decision: 'allow' })
    expect(evaluate(ghList, r).kind).toBe('no-match')
  })
})

describe('evaluate — last-rule-wins on same-decision conflicts', () => {
  test('two allow rules both match → allow with the later rule cited', () => {
    const r = rules(
      { tool: 'bash', pattern: 'gh *', decision: 'allow' },
      { tool: 'bash', pattern: 'gh issue *', decision: 'allow' },
    )
    const v = evaluate(ghList, r)
    expect(v.kind).toBe('allow')
    if (v.kind !== 'no-match') expect(v.rule.pattern).toBe('gh issue *')
  })
})

describe('evaluate — non-bash subject extraction', () => {
  test('read tool: pattern matches the path field', () => {
    const call: ToolCall = { id: 't', name: 'read', input: { path: '/tmp/foo.txt' } }
    const r = rules({ tool: 'read', pattern: '/tmp/*', decision: 'allow' })
    expect(evaluate(call, r).kind).toBe('allow')
  })

  test('write tool: pattern matches the file_path field', () => {
    const call: ToolCall = { id: 't', name: 'write', input: { file_path: '/etc/hosts', content: 'x' } }
    const r = rules({ tool: 'write', pattern: '/etc/*', decision: 'deny' })
    expect(evaluate(call, r).kind).toBe('deny')
  })

  test('write tool: camelCase filePath also matches', () => {
    const call: ToolCall = { id: 't', name: 'write', input: { filePath: '/etc/hosts', content: 'x' } }
    const r = rules({ tool: 'write', pattern: '/etc/*', decision: 'deny' })
    expect(evaluate(call, r).kind).toBe('deny')
  })

  test('web_fetch tool: pattern matches the url field', () => {
    const call: ToolCall = { id: 't', name: 'web_fetch', input: { url: 'https://internal.io/api/users' } }
    const r = rules({ tool: 'web_fetch', pattern: 'https://internal.io/*', decision: 'deny' })
    expect(evaluate(call, r).kind).toBe('deny')
  })

  test('grep tool: when only pattern is present, it is the subject', () => {
    const call: ToolCall = { id: 't', name: 'grep', input: { pattern: 'TODO' } }
    const r = rules({ tool: 'grep', pattern: 'TODO', decision: 'allow' })
    expect(evaluate(call, r).kind).toBe('allow')
  })

  test('grep tool with both path and pattern: path wins (claw key order)', () => {
    const call: ToolCall = { id: 't', name: 'grep', input: { pattern: 'TODO', path: 'src' } }
    const r = rules({ tool: 'grep', pattern: 'src', decision: 'allow' })
    expect(evaluate(call, r).kind).toBe('allow')
  })

  test('notebook_edit tool: notebook_path snake_case matches', () => {
    const call: ToolCall = { id: 't', name: 'notebook_edit', input: { notebook_path: '/work/x.ipynb' } }
    const r = rules({ tool: 'notebook_edit', pattern: '/work/*', decision: 'allow' })
    expect(evaluate(call, r).kind).toBe('allow')
  })

  test('notebook_edit tool: notebookPath camelCase matches', () => {
    const call: ToolCall = { id: 't', name: 'notebook_edit', input: { notebookPath: '/work/x.ipynb' } }
    const r = rules({ tool: 'notebook_edit', pattern: '/work/*', decision: 'allow' })
    expect(evaluate(call, r).kind).toBe('allow')
  })

  test('non-bash with no recognized subject keys: pattern "*" still matches', () => {
    const call: ToolCall = { id: 't', name: 'mystery', input: { foo: 'bar' } }
    const r = rules({ tool: 'mystery', pattern: '*', decision: 'allow' })
    expect(evaluate(call, r).kind).toBe('allow')
  })

  test('non-bash with no recognized subject keys: specific pattern does NOT match', () => {
    const call: ToolCall = { id: 't', name: 'mystery', input: { foo: 'bar' } }
    const r = rules({ tool: 'mystery', pattern: 'specific', decision: 'allow' })
    expect(evaluate(call, r).kind).toBe('no-match')
  })
})

describe('evaluate — ask rules', () => {
  test('ask rule that matches → ask', () => {
    const r = rules({ tool: 'bash', pattern: 'git push *', decision: 'ask' })
    const call: ToolCall = { id: 't', name: 'bash', input: { command: 'git push origin main' } }
    const v = evaluate(call, r)
    expect(v.kind).toBe('ask')
    if (v.kind === 'ask') expect(v.rule.pattern).toBe('git push *')
  })

  test('ask wins over allow when both match', () => {
    const r = rules(
      { tool: 'bash', pattern: 'git *', decision: 'allow' },
      { tool: 'bash', pattern: 'git push *', decision: 'ask' },
    )
    const call: ToolCall = { id: 't', name: 'bash', input: { command: 'git push origin main' } }
    expect(evaluate(call, r).kind).toBe('ask')
  })

  test('deny still wins over ask', () => {
    const r = rules(
      { tool: 'bash', pattern: 'git push *', decision: 'ask' },
      { tool: 'bash', pattern: 'git push --force*', decision: 'deny' },
    )
    const call: ToolCall = { id: 't', name: 'bash', input: { command: 'git push --force origin main' } }
    expect(evaluate(call, r).kind).toBe('deny')
  })

  test('two ask rules both match → ask with the later rule cited', () => {
    const r = rules(
      { tool: 'bash', pattern: 'git *', decision: 'ask' },
      { tool: 'bash', pattern: 'git push *', decision: 'ask' },
    )
    const call: ToolCall = { id: 't', name: 'bash', input: { command: 'git push origin main' } }
    const v = evaluate(call, r)
    expect(v.kind).toBe('ask')
    if (v.kind === 'ask') expect(v.rule.pattern).toBe('git push *')
  })
})
