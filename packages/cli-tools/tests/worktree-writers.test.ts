import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  addWorktree,
  applySliceDiff,
  findOverlaps,
  removeWorktree,
  resolveRepoRoot,
  sliceDiff,
  sliceFiles,
} from '../src/tools/worktree-writers'

// Strip hook-exported GIT_* vars so these tests behave the same when the
// suite itself runs inside a git hook (pre-commit).
const cleanEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key, value]) => value !== undefined && !key.startsWith('GIT_')),
) as Record<string, string>

async function run(cmd: string[], cwd: string): Promise<void> {
  const proc = Bun.spawn(cmd, { cwd, env: cleanEnv, stdout: 'ignore', stderr: 'pipe' })
  if ((await proc.exited) !== 0) {
    throw new Error(`${cmd.join(' ')} failed: ${await new Response(proc.stderr).text()}`)
  }
}

async function initRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'orchentra-repo-'))
  await run(['git', 'init', '-q', '-b', 'main'], dir)
  await run(['git', 'config', 'user.email', 'test@example.com'], dir)
  await run(['git', 'config', 'user.name', 'test'], dir)
  await writeFile(join(dir, 'base.txt'), 'base\n')
  await run(['git', 'add', '.'], dir)
  await run(['git', 'commit', '-q', '-m', 'init'], dir)
  return dir
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

describe('findOverlaps', () => {
  test('disjoint slices produce no overlaps', () => {
    expect(findOverlaps([['a.ts'], ['b.ts'], []])).toEqual([])
  })

  test('reports each overlapping pair with the shared files, 1-indexed', () => {
    const overlaps = findOverlaps([
      ['a.ts', 'shared.ts'],
      ['b.ts', 'shared.ts'],
      ['shared.ts', 'a.ts'],
    ])
    expect(overlaps).toEqual([
      { tasks: [1, 2], files: ['shared.ts'] },
      { tasks: [1, 3], files: ['shared.ts', 'a.ts'] },
      { tasks: [2, 3], files: ['shared.ts'] },
    ])
  })
})

describe('worktree slice lifecycle', () => {
  test('resolveRepoRoot returns null outside a repository', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'orchentra-norepo-'))
    try {
      expect(await resolveRepoRoot(dir)).toBeNull()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('add, change, diff, apply, and remove round-trips a slice into the parent', async () => {
    const repo = await initRepo()
    const root = (await resolveRepoRoot(repo))!
    try {
      const slice = await addWorktree(root)
      // A worktree starts at HEAD with the committed base file present.
      expect(await exists(join(slice.dir, 'base.txt'))).toBe(true)

      await writeFile(join(slice.dir, 'new.txt'), 'created\n')
      await writeFile(join(slice.dir, 'base.txt'), 'edited\n')
      expect(await sliceFiles(slice.dir)).toEqual(['base.txt', 'new.txt'])

      const patch = await sliceDiff(slice.dir)
      expect(patch).toContain('new.txt')
      await applySliceDiff(root, patch)
      expect(await Bun.file(join(repo, 'new.txt')).text()).toBe('created\n')
      expect(await Bun.file(join(repo, 'base.txt')).text()).toBe('edited\n')

      await removeWorktree(root, slice.dir)
      expect(await exists(slice.dir)).toBe(false)
    } finally {
      await rm(repo, { recursive: true, force: true })
    }
  })

  test('applying a conflicting slice diff fails loudly and applies nothing', async () => {
    const repo = await initRepo()
    const root = (await resolveRepoRoot(repo))!
    try {
      const slice = await addWorktree(root)
      await writeFile(join(slice.dir, 'base.txt'), 'slice version\n')
      const patch = await sliceDiff(slice.dir)
      // Parent diverges on the same file before merge-back.
      await writeFile(join(repo, 'base.txt'), 'parent version\n')
      await expect(applySliceDiff(root, patch)).rejects.toThrow('slice merge-back rejected')
      expect(await Bun.file(join(repo, 'base.txt')).text()).toBe('parent version\n')
      await removeWorktree(root, slice.dir)
    } finally {
      await rm(repo, { recursive: true, force: true })
    }
  })

  test('removeWorktree salvages the child trace dir into the parent repo', async () => {
    const repo = await initRepo()
    const root = (await resolveRepoRoot(repo))!
    try {
      const slice = await addWorktree(root)
      const traceDir = join(slice.dir, '.orchentra', 'traces', 'trace-123')
      await run(['mkdir', '-p', traceDir], slice.dir)
      await writeFile(join(traceDir, 'manifest.json'), '{}')
      await removeWorktree(root, slice.dir)
      expect(await exists(join(root, '.orchentra', 'traces', 'trace-123', 'manifest.json'))).toBe(true)
      expect(await exists(slice.dir)).toBe(false)
    } finally {
      await rm(repo, { recursive: true, force: true })
    }
  })
})
