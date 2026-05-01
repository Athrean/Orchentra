import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadPolicy } from '../src/permissions/policy-loader'

const dirs: string[] = []
function workspace(): string {
  const d = mkdtempSync(join(tmpdir(), 'policy-loader-'))
  dirs.push(d)
  mkdirSync(join(d, '.orchentra'), { recursive: true })
  return d
}
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})

const wait = (ms: number): Promise<void> => new Promise<void>((r) => setTimeout(r, ms))

describe('loadPolicy — initial load', () => {
  test('valid file → ruleset matches', () => {
    const cwd = workspace()
    writeFileSync(
      join(cwd, '.orchentra', 'permissions.json'),
      JSON.stringify({ version: 1, rules: [{ tool: 'bash', pattern: 'gh *', decision: 'allow' }] }),
    )
    const { ruleset, close } = loadPolicy(cwd)
    expect(ruleset.rules).toHaveLength(1)
    expect(ruleset.rules[0]?.pattern).toBe('gh *')
    close()
  })

  test('missing file → empty ruleset, no warning', () => {
    const cwd = workspace()
    const warns: string[] = []
    const { ruleset, close } = loadPolicy(cwd, { onWarn: (m) => warns.push(m) })
    expect(ruleset.rules).toEqual([])
    expect(warns).toEqual([])
    close()
  })

  test('malformed JSON → empty ruleset, warning fired', () => {
    const cwd = workspace()
    writeFileSync(join(cwd, '.orchentra', 'permissions.json'), '{not json')
    const warns: string[] = []
    const { ruleset, close } = loadPolicy(cwd, { onWarn: (m) => warns.push(m) })
    expect(ruleset.rules).toEqual([])
    expect(warns[0]).toMatch(/malformed|json/i)
    close()
  })

  test('wrong schema version → empty ruleset, warning fired', () => {
    const cwd = workspace()
    writeFileSync(
      join(cwd, '.orchentra', 'permissions.json'),
      JSON.stringify({ version: 99, rules: [{ tool: 'bash', pattern: 'x', decision: 'allow' }] }),
    )
    const warns: string[] = []
    const { ruleset, close } = loadPolicy(cwd, { onWarn: (m) => warns.push(m) })
    expect(ruleset.rules).toEqual([])
    expect(warns[0]).toMatch(/version/i)
    close()
  })

  test('drops malformed rule entries but keeps the rest', () => {
    const cwd = workspace()
    writeFileSync(
      join(cwd, '.orchentra', 'permissions.json'),
      JSON.stringify({
        version: 1,
        rules: [
          { tool: 'bash', pattern: 'ok', decision: 'allow' },
          { tool: 'bash', pattern: 42, decision: 'allow' },
          { tool: 'bash', pattern: 'no', decision: 'maybe' },
        ],
      }),
    )
    const { ruleset, close } = loadPolicy(cwd)
    expect(ruleset.rules.map((r) => r.pattern)).toEqual(['ok'])
    close()
  })
})

describe('loadPolicy — hot reload', () => {
  test('writing the file emits a "change" event with the new ruleset', async () => {
    const cwd = workspace()
    const path = join(cwd, '.orchentra', 'permissions.json')
    writeFileSync(path, JSON.stringify({ version: 1, rules: [] }))
    const handle = loadPolicy(cwd, { watch: true })
    const seen: number[] = []
    handle.on('change', (next) => seen.push(next.rules.length))
    await wait(50)
    writeFileSync(path, JSON.stringify({ version: 1, rules: [{ tool: 'bash', pattern: 'x', decision: 'allow' }] }))
    await wait(150)
    expect(seen[seen.length - 1]).toBe(1)
    handle.close()
  })

  test('invalid change → keeps last good ruleset, warning fired', async () => {
    const cwd = workspace()
    const path = join(cwd, '.orchentra', 'permissions.json')
    writeFileSync(path, JSON.stringify({ version: 1, rules: [{ tool: 'bash', pattern: 'good', decision: 'allow' }] }))
    const warns: string[] = []
    const handle = loadPolicy(cwd, { watch: true, onWarn: (m) => warns.push(m) })
    expect(handle.ruleset.rules).toHaveLength(1)
    await wait(50)
    writeFileSync(path, '{not json')
    await wait(150)
    expect(handle.ruleset.rules[0]?.pattern).toBe('good')
    expect(warns[warns.length - 1]).toMatch(/malformed|json/i)
    handle.close()
  })

  test('close() stops the watcher (no further change events)', async () => {
    const cwd = workspace()
    const path = join(cwd, '.orchentra', 'permissions.json')
    writeFileSync(path, JSON.stringify({ version: 1, rules: [] }))
    const handle = loadPolicy(cwd, { watch: true })
    let count = 0
    handle.on('change', () => count++)
    handle.close()
    await wait(50)
    writeFileSync(path, JSON.stringify({ version: 1, rules: [{ tool: 'bash', pattern: 'x', decision: 'allow' }] }))
    await wait(150)
    expect(count).toBe(0)
  })
})
