import { cp, mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Worktree isolation for parallel write-capable sub-agents (M6 phase-1).
 * Each builder gets its own `git worktree` at the parent's HEAD, so
 * concurrent slices never race on shared files; the parent merges gated,
 * disjoint slices back and fails loudly on overlapping ownership.
 */

export interface WorktreeSlice {
  /** Absolute path of the throwaway worktree. */
  readonly dir: string
}

interface GitOutcome {
  ok: boolean
  stdout: string
  stderr: string
}

// Hook-exported git vars (GIT_DIR, GIT_INDEX_FILE, …) leak in when the host
// process runs inside a git hook and would redirect these commands at the
// hooked repo — a relative GIT_INDEX_FILE even breaks outright inside a
// worktree, where .git is a file. Spawn git with a scrubbed environment.
function gitEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith('GIT_')) env[key] = value
  }
  return env
}

async function git(args: string[], cwd: string, stdin?: string): Promise<GitOutcome> {
  const proc = Bun.spawn(['git', ...args], {
    cwd,
    env: gitEnv(),
    stdin: stdin === undefined ? 'ignore' : new TextEncoder().encode(stdin),
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { ok: exitCode === 0, stdout, stderr }
}

function fail(action: string, outcome: GitOutcome): never {
  throw new Error(`${action}: ${(outcome.stderr || outcome.stdout).trim() || 'git failed'}`)
}

/** Top-level repo dir for `cwd`, or null when not inside a git work tree. */
export async function resolveRepoRoot(cwd: string): Promise<string | null> {
  const outcome = await git(['rev-parse', '--show-toplevel'], cwd)
  return outcome.ok ? outcome.stdout.trim() : null
}

/** Detached throwaway worktree at the repo's current HEAD, under the OS tmpdir. */
export async function addWorktree(repoRoot: string): Promise<WorktreeSlice> {
  const dir = await mkdtemp(join(tmpdir(), 'orchentra-slice-'))
  const outcome = await git(['worktree', 'add', '--detach', dir, 'HEAD'], repoRoot)
  if (!outcome.ok) {
    await rm(dir, { recursive: true, force: true })
    fail('worktree add failed', outcome)
  }
  return { dir }
}

/** Repo-relative paths a slice touched (modified, added, deleted, renamed, untracked). */
export async function sliceFiles(dir: string): Promise<string[]> {
  const outcome = await git(['status', '--porcelain'], dir)
  if (!outcome.ok) fail('worktree status failed', outcome)
  const files = new Set<string>()
  for (const line of outcome.stdout.split('\n')) {
    if (line.length < 4) continue
    // Porcelain v1: `XY path` or `XY old -> new` for renames; both sides count
    // as ownership because merge-back writes one and removes the other.
    for (const path of line.slice(3).split(' -> ')) {
      const file = unquote(path)
      // The child runtime's own bookkeeping (traces, sessions) is not part of
      // the slice: it is salvaged separately and never merged back.
      if (file === '.orchentra' || file.startsWith('.orchentra/')) continue
      files.add(file)
    }
  }
  return Array.from(files).sort()
}

function unquote(path: string): string {
  if (!path.startsWith('"') || !path.endsWith('"')) return path
  return path.slice(1, -1).replace(/\\(.)/g, '$1')
}

export interface SliceOverlap {
  readonly tasks: readonly [number, number]
  readonly files: readonly string[]
}

/** Pairwise file-ownership overlaps between slices; empty means disjoint. */
export function findOverlaps(slices: readonly (readonly string[])[]): SliceOverlap[] {
  const overlaps: SliceOverlap[] = []
  for (let a = 0; a < slices.length; a++) {
    for (let b = a + 1; b < slices.length; b++) {
      const owned = new Set(slices[a])
      const shared = slices[b]!.filter((file) => owned.has(file))
      if (shared.length > 0) overlaps.push({ tasks: [a + 1, b + 1], files: shared })
    }
  }
  return overlaps
}

/** Full binary diff of everything the slice changed relative to its base HEAD. */
export async function sliceDiff(dir: string): Promise<string> {
  // Stage everything first so untracked files and deletions appear in one
  // HEAD-relative diff; the index is throwaway along with the worktree. The
  // child's own .orchentra bookkeeping stays out of the slice.
  const staged = await git(['add', '-A', '--', '.', ':(exclude).orchentra'], dir)
  if (!staged.ok) fail('worktree stage failed', staged)
  const outcome = await git(['diff', '--cached', '--binary', 'HEAD'], dir)
  if (!outcome.ok) fail('worktree diff failed', outcome)
  return outcome.stdout
}

/** Apply a gated slice's diff to the parent tree; loud failure, no partial apply. */
export async function applySliceDiff(repoRoot: string, patch: string): Promise<void> {
  if (patch.length === 0) return
  const check = await git(['apply', '--check', '--binary'], repoRoot, patch)
  if (!check.ok) fail('slice merge-back rejected', check)
  const applied = await git(['apply', '--binary'], repoRoot, patch)
  if (!applied.ok) fail('slice merge-back failed', applied)
}

/**
 * Remove a throwaway worktree, first salvaging the child's trace dirs into
 * the parent repo so the trace ids linked from the parent manifest survive.
 */
export async function removeWorktree(repoRoot: string, dir: string): Promise<void> {
  for (const sub of ['traces', 'quarantine']) {
    const from = join(dir, '.orchentra', sub)
    if (await exists(from)) {
      await cp(from, join(repoRoot, '.orchentra', sub), { recursive: true, force: false, errorOnExist: false })
    }
  }
  const outcome = await git(['worktree', 'remove', '--force', dir], repoRoot)
  if (!outcome.ok) {
    // The worktree dir may already be gone; make git forget it either way.
    await rm(dir, { recursive: true, force: true })
    await git(['worktree', 'prune'], repoRoot)
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}
