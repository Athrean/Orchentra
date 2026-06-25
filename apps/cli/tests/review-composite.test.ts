import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { review, type CheckRunner } from '../src/composites/review'
import type { Finding, LlmCaller } from '../src/composites/scan'

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
