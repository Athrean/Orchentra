import { describe, expect, test } from 'bun:test'
import { detectGitContext, renderGitContext } from '../src/runtime/git-context'
import type { GitContext } from '../src/runtime/git-context'

function tempDir(label: string): string {
  const unique = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  return `/tmp/orchentra-git-${label}-${unique}`
}

function runGit(cwd: string, args: string[]): void {
  const proc = Bun.spawnSync(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' })
  if (!proc.success) throw new Error(`git ${args.join(' ')} failed in ${cwd}`)
}

function gitTest(name: string, fn: () => void | Promise<void>): void {
  test(name, async () => {
    try {
      await fn()
    } catch (e: unknown) {
      if (e instanceof Error && 'code' in e && (e as NodeJS.ErrnoException).code === 'ENOENT') {
        return
      }
      throw e
    }
  })
}

describe('detectGitContext', () => {
  test('returns null for non-git directory', () => {
    const dir = tempDir('non-git')
    Bun.spawnSync(['mkdir', '-p', dir])
    const result = detectGitContext(dir)
    expect(result).toBeNull()
  })
})

describe('detectGitContext (requires git)', () => {
  gitTest('detects branch name and commits', async () => {
    const dir = tempDir('branch-commits')
    runGit(dir, ['init', '--quiet', '--initial-branch=main'])
    runGit(dir, ['config', 'user.email', 'tests@example.com'])
    runGit(dir, ['config', 'user.name', 'Git Context Tests'])

    await Bun.write(`${dir}/a.txt`, 'a\n')
    runGit(dir, ['add', 'a.txt'])
    runGit(dir, ['commit', '-m', 'first commit', '--quiet'])

    await Bun.write(`${dir}/b.txt`, 'b\n')
    runGit(dir, ['add', 'b.txt'])
    runGit(dir, ['commit', '-m', 'second commit', '--quiet'])

    const context = detectGitContext(dir)
    expect(context).not.toBeNull()
    expect(context!.branch).toBe('main')
    expect(context!.recentCommits.length).toBe(2)
    expect(context!.recentCommits[0].subject).toBe('second commit')
    expect(context!.recentCommits[1].subject).toBe('first commit')
    expect(context!.stagedFiles.length).toBe(0)
  })

  gitTest('detects staged files', async () => {
    const dir = tempDir('staged')
    runGit(dir, ['init', '--quiet', '--initial-branch=main'])
    runGit(dir, ['config', 'user.email', 'tests@example.com'])
    runGit(dir, ['config', 'user.name', 'Git Context Tests'])

    await Bun.write(`${dir}/init.txt`, 'init\n')
    runGit(dir, ['add', 'init.txt'])
    runGit(dir, ['commit', '-m', 'initial', '--quiet'])

    await Bun.write(`${dir}/staged.txt`, 'staged\n')
    runGit(dir, ['add', 'staged.txt'])

    const context = detectGitContext(dir)
    expect(context).not.toBeNull()
    expect(context!.stagedFiles).toContain('staged.txt')
  })

  gitTest('limits to five recent commits', async () => {
    const dir = tempDir('five-commits')
    runGit(dir, ['init', '--quiet', '--initial-branch=main'])
    runGit(dir, ['config', 'user.email', 'tests@example.com'])
    runGit(dir, ['config', 'user.name', 'Git Context Tests'])

    for (let i = 1; i <= 8; i++) {
      await Bun.write(`${dir}/file${i}.txt`, `${i}\n`)
      runGit(dir, ['add', `file${i}.txt`])
      runGit(dir, ['commit', '-m', `commit ${i}`, '--quiet'])
    }

    const context = detectGitContext(dir)
    expect(context).not.toBeNull()
    expect(context!.recentCommits.length).toBe(5)
    expect(context!.recentCommits[0].subject).toBe('commit 8')
    expect(context!.recentCommits[4].subject).toBe('commit 4')
  })
})

describe('renderGitContext', () => {
  test('formats all sections', () => {
    const ctx: GitContext = {
      branch: 'feat/test',
      recentCommits: [
        { hash: 'abc1234', subject: 'add feature' },
        { hash: 'def5678', subject: 'fix bug' },
      ],
      stagedFiles: ['src/main.ts'],
    }
    const rendered = renderGitContext(ctx)
    expect(rendered).toContain('Git branch: feat/test')
    expect(rendered).toContain('abc1234 add feature')
    expect(rendered).toContain('def5678 fix bug')
    expect(rendered).toContain('src/main.ts')
  })

  test('omits empty sections', () => {
    const ctx: GitContext = {
      branch: 'main',
      recentCommits: [],
      stagedFiles: [],
    }
    const rendered = renderGitContext(ctx)
    expect(rendered).toContain('Git branch: main')
    expect(rendered).not.toContain('Recent commits:')
    expect(rendered).not.toContain('Staged files:')
  })
})
