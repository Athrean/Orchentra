import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { scan, type Finding, type LlmCaller } from '../src/composites/scan'

function fakeLlm(canned: Finding[]): LlmCaller {
  return async () => ({
    text: JSON.stringify(canned),
    model: 'fake-model',
    tokensIn: 100,
    tokensOut: 50,
  })
}

function malformedLlm(text: string): LlmCaller {
  return async () => ({ text, model: 'fake-model', tokensIn: 1, tokensOut: 1 })
}

// Strip ambient GIT_* env so child `git` invocations only see `cwd` for
// discovery. Without this, running these tests inside a `git commit` hook
// (which exports GIT_DIR / GIT_WORK_TREE / GIT_INDEX_FILE) makes `git init`
// target the parent repo instead of the tmp dir, corrupting the host branch.
function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !k.startsWith('GIT_')) env[k] = v
  }
  return env
}

function makeRepo(): string {
  const d = mkdtempSync(join(tmpdir(), 'scan-'))
  const env = cleanEnv()
  spawnSync('git', ['init', '-q'], { cwd: d, env })
  spawnSync('git', ['config', 'user.email', 't@t'], { cwd: d, env })
  spawnSync('git', ['config', 'user.name', 't'], { cwd: d, env })
  writeFileSync(join(d, 'a.ts'), 'export const x = 1\n')
  spawnSync('git', ['add', '.'], { cwd: d, env })
  spawnSync('git', ['commit', '-q', '-m', 'init'], { cwd: d, env })
  return d
}

describe('/scan composite', () => {
  test('mode=path returns parsed findings from a structured LLM response', async () => {
    const repo = makeRepo()
    const finding: Finding = {
      file: 'a.ts',
      line: 1,
      severity: 'P1',
      title: 'unused export',
      description: 'export not consumed',
      suggestedFix: 'remove it',
    }
    const result = await scan({
      cwd: repo,
      mode: 'path',
      path: 'a.ts',
      llm: fakeLlm([finding]),
    })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].title).toBe('unused export')
    expect(result.model).toBe('fake-model')
  })

  test('empty payload short-circuits without calling the LLM', async () => {
    const repo = makeRepo()
    // Empty file → empty payload → no LLM call.
    writeFileSync(join(repo, 'empty.ts'), '')
    let called = 0
    const result = await scan({
      cwd: repo,
      mode: 'path',
      path: 'empty.ts',
      llm: async () => {
        called++
        return { text: '[]', model: 'm', tokensIn: 0, tokensOut: 0 }
      },
    })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.findings).toEqual([])
    expect(called).toBe(0)
  })

  test('malformed LLM JSON surfaces an error', async () => {
    const repo = makeRepo()
    const result = await scan({
      cwd: repo,
      mode: 'path',
      path: 'a.ts',
      llm: malformedLlm('not really JSON'),
    })
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error.toLowerCase()).toContain('malformed')
    }
  })

  test('tolerates ```json fenced output', async () => {
    const repo = makeRepo()
    const result = await scan({
      cwd: repo,
      mode: 'path',
      path: 'a.ts',
      llm: malformedLlm('```json\n[]\n```'),
    })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.findings).toEqual([])
  })

  test('mode=path with missing file returns an error, not a crash', async () => {
    const repo = makeRepo()
    const result = await scan({
      cwd: repo,
      mode: 'path',
      path: 'nonexistent.ts',
      llm: fakeLlm([]),
    })
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error.toLowerCase()).toContain('cannot read')
    }
  })

  test('drops findings with bogus severity', async () => {
    const repo = makeRepo()
    const llm: LlmCaller = async () => ({
      text: JSON.stringify([
        { file: 'a.ts', line: 1, severity: 'P0', title: 'good', description: 'ok', suggestedFix: null },
        { file: 'a.ts', line: 1, severity: 'CRITICAL', title: 'bad', description: 'wrong sev', suggestedFix: null },
      ]),
      model: 'm',
      tokensIn: 1,
      tokensOut: 1,
    })
    const result = await scan({ cwd: repo, mode: 'path', path: 'a.ts', llm })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].title).toBe('good')
  })
})
