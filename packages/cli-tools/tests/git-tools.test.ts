import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gitStatusTool, gitDiffTool, gitLogTool } from '../src/tools/git-tools'
import type { ToolContext } from '@orchentra/cli-core'

const dirs: string[] = []
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})

function git(cwd: string, ...args: string[]): void {
  const proc = Bun.spawnSync(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe', env: cleanGitEnv() })
  if (proc.exitCode !== 0) throw new Error(`git ${args.join(' ')} failed: ${proc.stderr.toString()}`)
}

function cleanGitEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith('GIT_')) env[key] = value
  }
  return env
}

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'orchentra-git-tool-'))
  dirs.push(dir)
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  writeFileSync(join(dir, 'a.txt'), 'first line\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'initial commit')
  return dir
}

function ctx(cwd: string): ToolContext {
  return { sessionId: 't', cwd }
}

describe('gitStatusTool', () => {
  test('reports the branch and a clean tree', async () => {
    const dir = makeRepo()
    const res = await gitStatusTool.execute({}, ctx(dir))
    expect(res.isError).toBe(false)
    expect(res.content.toLowerCase()).toContain('branch')
    expect(res.content.toLowerCase()).toContain('clean')
  })

  test('lists an untracked file', async () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'new.txt'), 'x\n')
    const res = await gitStatusTool.execute({}, ctx(dir))
    expect(res.isError).toBe(false)
    expect(res.content).toContain('new.txt')
  })

  test('errors helpfully outside a git repo', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orchentra-nogit-'))
    dirs.push(dir)
    const res = await gitStatusTool.execute({}, ctx(dir))
    expect(res.isError).toBe(true)
    expect(res.content.toLowerCase()).toContain('not a git repository')
  })
})

describe('gitDiffTool', () => {
  test('shows unstaged changes to a tracked file', async () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.txt'), 'first line\nsecond line\n')
    const res = await gitDiffTool.execute({}, ctx(dir))
    expect(res.isError).toBe(false)
    expect(res.content).toContain('second line')
  })

  test('staged flag shows only staged changes', async () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.txt'), 'first line\nstaged change\n')
    git(dir, 'add', 'a.txt')
    writeFileSync(join(dir, 'a.txt'), 'first line\nstaged change\nunstaged change\n')
    const staged = await gitDiffTool.execute({ staged: true }, ctx(dir))
    expect(staged.content).toContain('staged change')
    expect(staged.content).not.toContain('unstaged change')
  })
})

describe('gitLogTool', () => {
  test('lists commit subjects and respects limit', async () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.txt'), 'v2\n')
    git(dir, 'commit', '-q', '-am', 'second commit')
    writeFileSync(join(dir, 'a.txt'), 'v3\n')
    git(dir, 'commit', '-q', '-am', 'third commit')

    const all = await gitLogTool.execute({}, ctx(dir))
    expect(all.isError).toBe(false)
    expect(all.content).toContain('third commit')
    expect(all.content).toContain('initial commit')

    const one = await gitLogTool.execute({ limit: 1 }, ctx(dir))
    expect(one.content).toContain('third commit')
    expect(one.content).not.toContain('initial commit')
  })
})
