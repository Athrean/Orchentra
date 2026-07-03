import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { review, type CheckRunner } from '../src/composites/review'
import type { Finding, LlmCaller } from '../src/composites/scan'

/** Real check outputs captured from tsc and bun test runs. */
function fixture(name: string): string {
  return readFileSync(join(import.meta.dir, 'fixtures', 'diagnostics', name), 'utf-8')
}

function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !k.startsWith('GIT_')) env[k] = v
  }
  return env
}

function makeRepo(): string {
  const d = mkdtempSync(join(tmpdir(), 'review-'))
  const env = cleanEnv()
  spawnSync('git', ['init', '-q'], { cwd: d, env })
  spawnSync('git', ['config', 'user.email', 't@t'], { cwd: d, env })
  spawnSync('git', ['config', 'user.name', 't'], { cwd: d, env })
  writeFileSync(join(d, 'a.ts'), 'export const x = 1\n')
  spawnSync('git', ['add', '.'], { cwd: d, env })
  spawnSync('git', ['commit', '-q', '-m', 'init'], { cwd: d, env })
  return d
}

function fakeLlm(canned: Finding[]): LlmCaller {
  return async () => ({ text: JSON.stringify(canned), model: 'fake-model', tokensIn: 100, tokensOut: 50 })
}

const finding: Finding = {
  file: 'a.ts',
  line: 1,
  severity: 'P1',
  title: 'unused export',
  description: 'export not consumed',
  suggestedFix: 'remove it',
}

describe('/review composite (verify by running)', () => {
  test('passes findings through and runs the injected checks', async () => {
    const repo = makeRepo()
    const ran: string[] = []
    const run: CheckRunner = (command) => {
      ran.push(command)
      return command.includes('test') ? { exitCode: 1, output: 'a.test.ts: 1 fail' } : { exitCode: 0, output: 'ok' }
    }
    const result = await review({
      cwd: repo,
      mode: 'path',
      path: 'a.ts',
      llm: fakeLlm([finding]),
      checks: [
        { name: 'typecheck', command: 'bun run typecheck' },
        { name: 'test', command: 'bun run test' },
      ],
      run,
    })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.findings).toHaveLength(1)
    expect(ran).toEqual(['bun run typecheck', 'bun run test'])
    expect(result.checks.find((c) => c.name === 'typecheck')?.passed).toBe(true)
    const failed = result.checks.find((c) => c.name === 'test')
    expect(failed?.passed).toBe(false)
    expect(failed?.exitCode).toBe(1)
    expect(failed?.output).toContain('1 fail')
  })

  test('same path + line in a failing gate corroborates as strong evidence', async () => {
    const repo = makeRepo()
    const result = await review({
      cwd: repo,
      mode: 'path',
      path: 'a.ts',
      llm: fakeLlm([finding]),
      checks: [{ name: 'test', command: 'bun run test' }],
      run: () => ({ exitCode: 1, output: 'FAIL a.ts:1 expected <= got <' }),
    })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.findings[0].corroboration).toEqual([
      { check: 'test', strength: 'strong', evidence: 'FAIL a.ts:1 expected <= got <' },
    ])
  })

  test('same basename in a different directory no longer corroborates', async () => {
    const repo = makeRepo()
    const result = await review({
      cwd: repo,
      mode: 'path',
      path: 'a.ts',
      llm: fakeLlm([
        { ...finding, file: 'apps/web/src/index.ts', line: 3 },
        { ...finding, file: 'a.ts', line: 9 },
      ]),
      checks: [{ name: 'typecheck', command: 'bun run typecheck' }],
      run: () => ({
        exitCode: 1,
        output: 'packages/core/src/index.ts(3,1): error TS2322: boom\nFAIL src/a.ts:9 not the root a.ts',
      }),
    })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.findings[0].corroboration).toEqual([])
    expect(result.findings[1].corroboration).toEqual([])
  })

  test('a finding no failing gate references stays uncorroborated', async () => {
    const repo = makeRepo()
    const result = await review({
      cwd: repo,
      mode: 'path',
      path: 'a.ts',
      llm: fakeLlm([finding]),
      checks: [{ name: 'test', command: 'bun run test' }],
      run: () => ({ exitCode: 1, output: 'FAIL b.ts:9 unrelated' }),
    })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.findings[0].corroboration).toEqual([])
  })

  test('a passing gate that references the file does not corroborate', async () => {
    const repo = makeRepo()
    const result = await review({
      cwd: repo,
      mode: 'path',
      path: 'a.ts',
      llm: fakeLlm([finding]),
      checks: [{ name: 'test', command: 'bun run test' }],
      run: () => ({ exitCode: 0, output: 'a.ts ok' }),
    })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.findings[0].corroboration).toEqual([])
  })

  test('tsc output: exact line is strong, distant line and no line are weak', async () => {
    const repo = makeRepo()
    const tsc = fixture('tsc-plain.txt')
    const result = await review({
      cwd: repo,
      mode: 'path',
      path: 'a.ts',
      llm: fakeLlm([
        { ...finding, file: 'src/pricing.ts', line: 6 },
        { ...finding, file: 'src/pricing.ts', line: 40 },
        { ...finding, file: 'src/pricing.ts', line: null },
      ]),
      checks: [{ name: 'typecheck', command: 'bun run typecheck' }],
      run: () => ({ exitCode: 2, output: tsc }),
    })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.findings[0].corroboration).toEqual([
      {
        check: 'typecheck',
        strength: 'strong',
        evidence: "src/pricing.ts(6,9): error TS2322: Type 'string' is not assignable to type 'number'.",
      },
    ])
    expect(result.findings[1].corroboration).toMatchObject([{ check: 'typecheck', strength: 'weak' }])
    expect(result.findings[2].corroboration).toMatchObject([{ check: 'typecheck', strength: 'weak' }])
  })

  test('a claimed line within 2 of the diagnostic still counts as strong', async () => {
    const repo = makeRepo()
    const result = await review({
      cwd: repo,
      mode: 'path',
      path: 'a.ts',
      llm: fakeLlm([
        { ...finding, file: 'src/pricing.ts', line: 8 },
        { ...finding, file: 'src/pricing.ts', line: 9 },
      ]),
      checks: [{ name: 'typecheck', command: 'bun run typecheck' }],
      run: () => ({ exitCode: 2, output: fixture('tsc-plain.txt') }),
    })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.findings[0].corroboration).toMatchObject([{ strength: 'strong' }])
    expect(result.findings[1].corroboration).toMatchObject([{ strength: 'weak' }])
  })

  test('tsc --pretty output corroborates through the ANSI colour codes', async () => {
    const repo = makeRepo()
    const result = await review({
      cwd: repo,
      mode: 'path',
      path: 'a.ts',
      llm: fakeLlm([{ ...finding, file: 'src/pricing.ts', line: 6 }]),
      checks: [{ name: 'typecheck', command: 'bun run typecheck' }],
      run: () => ({ exitCode: 2, output: fixture('tsc-pretty.txt') }),
    })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.findings[0].corroboration).toMatchObject([{ check: 'typecheck', strength: 'strong' }])
    expect(result.findings[0].corroboration[0].evidence).not.toContain('')
    expect(result.findings[0].corroboration[0].evidence).toContain('TS2322')
  })

  test('bun test stack frames corroborate by absolute-path suffix and line', async () => {
    const repo = makeRepo()
    const bunOut = fixture('bun-test-fail.txt')
    const result = await review({
      cwd: repo,
      mode: 'path',
      path: 'a.ts',
      llm: fakeLlm([
        { ...finding, file: 'tests/pricing.test.ts', line: 5 },
        { ...finding, file: 'tests/pricing.test.ts', line: null },
      ]),
      checks: [{ name: 'test', command: 'bun run test' }],
      run: () => ({ exitCode: 1, output: bunOut }),
    })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.findings[0].corroboration).toMatchObject([{ check: 'test', strength: 'strong' }])
    expect(result.findings[0].corroboration[0].evidence).toContain('pricing.test.ts:5')
    expect(result.findings[1].corroboration).toMatchObject([{ check: 'test', strength: 'weak' }])
  })

  test('workspace-relative diagnostic paths corroborate a repo-relative finding', async () => {
    const repo = makeRepo()
    const result = await review({
      cwd: repo,
      mode: 'path',
      path: 'a.ts',
      llm: fakeLlm([{ ...finding, file: 'apps/cli/src/composites/review.ts', line: 88 }]),
      checks: [{ name: 'typecheck', command: 'bun run typecheck' }],
      run: () => ({ exitCode: 2, output: 'src/composites/review.ts(88,7): error TS2322: boom' }),
    })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.findings[0].corroboration).toMatchObject([{ check: 'typecheck', strength: 'strong' }])
  })

  test('collects evidence from every failing gate that references the finding', async () => {
    const repo = makeRepo()
    const result = await review({
      cwd: repo,
      mode: 'path',
      path: 'a.ts',
      llm: fakeLlm([{ ...finding, file: 'src/pricing.ts', line: 6 }]),
      checks: [
        { name: 'typecheck', command: 'bun run typecheck' },
        { name: 'test', command: 'bun run test' },
      ],
      run: (command) =>
        command.includes('typecheck')
          ? { exitCode: 2, output: fixture('tsc-plain.txt') }
          : { exitCode: 1, output: 'FAIL: something in src/pricing.ts broke' },
    })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.findings[0].corroboration).toMatchObject([
      { check: 'typecheck', strength: 'strong' },
      { check: 'test', strength: 'weak' },
    ])
  })

  test('corroborates against the full output even when the stored tail truncates it', async () => {
    const repo = makeRepo()
    const output = 'src/pricing.ts(6,9): error TS2322: boom\n' + 'x'.repeat(5000)
    const result = await review({
      cwd: repo,
      mode: 'path',
      path: 'a.ts',
      llm: fakeLlm([{ ...finding, file: 'src/pricing.ts', line: 6 }]),
      checks: [{ name: 'typecheck', command: 'bun run typecheck' }],
      run: () => ({ exitCode: 2, output }),
    })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.checks[0].output.length).toBe(2000)
    expect(result.findings[0].corroboration).toMatchObject([{ check: 'typecheck', strength: 'strong' }])
  })

  test('a scan error short-circuits before running any check', async () => {
    const repo = makeRepo()
    let ranAny = false
    const result = await review({
      cwd: repo,
      mode: 'path',
      path: 'a.ts',
      llm: async () => ({ text: 'not json', model: 'm', tokensIn: 1, tokensOut: 1 }),
      checks: [{ name: 'typecheck', command: 'bun run typecheck' }],
      run: () => {
        ranAny = true
        return { exitCode: 0, output: '' }
      },
    })
    expect('error' in result).toBe(true)
    expect(ranAny).toBe(false)
  })

  test('discovers typecheck + test from the cwd package.json', async () => {
    const repo = makeRepo()
    writeFileSync(
      join(repo, 'package.json'),
      JSON.stringify({ scripts: { typecheck: 'tsc --noEmit', 'test:precommit': 'bun test' } }),
    )
    const ran: string[] = []
    const result = await review({
      cwd: repo,
      mode: 'path',
      path: 'a.ts',
      llm: fakeLlm([]),
      run: (command) => {
        ran.push(command)
        return { exitCode: 0, output: '' }
      },
    })
    expect('error' in result).toBe(false)
    expect(ran).toEqual(['bun run typecheck', 'bun run test:precommit'])
  })

  test('no package.json scripts → no checks, findings still returned', async () => {
    const repo = makeRepo()
    writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'x' }))
    const result = await review({ cwd: repo, mode: 'path', path: 'a.ts', llm: fakeLlm([finding]) })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.checks).toEqual([])
    expect(result.findings).toHaveLength(1)
  })

  test('caps check output to the tail', async () => {
    const repo = makeRepo()
    const big = 'x'.repeat(5000)
    const result = await review({
      cwd: repo,
      mode: 'path',
      path: 'a.ts',
      llm: fakeLlm([]),
      checks: [{ name: 'test', command: 'bun run test' }],
      run: () => ({ exitCode: 1, output: big }),
    })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.checks[0].output.length).toBe(2000)
  })
})
