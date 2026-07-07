import { promises as fs } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fuzzyScore } from './fuzzy'
import { makeIgnoreMatcher, parseGitignore } from './gitignore'
import type { SuggestionItem } from '../types'

const MAX_ENTRIES = 5000
const MAX_DEPTH = 6
// A performance/safety floor skipped regardless of .gitignore — these are
// catastrophic to walk and effectively always ignored. Everything else is
// driven by the repo's actual .gitignore.
const ALWAYS_SKIP = new Set(['.git', 'node_modules'])

type IgnoreMatcher = (relPath: string, isDir: boolean) => boolean

export interface FileIndex {
  readonly cwd: string
  /** Workspace-relative POSIX paths. */
  readonly entries: readonly string[]
}

let cachedIndex: FileIndex | null = null
let cachedAt = 0
const CACHE_TTL_MS = 30_000

/**
 * Walk the workspace once and cache the result. Skips heavy directories.
 * Cached for 30s — fresh enough for interactive use, cheap enough to ignore.
 */
export async function loadFileIndex(cwd: string): Promise<FileIndex> {
  const now = Date.now()
  if (cachedIndex && cachedIndex.cwd === cwd && now - cachedAt < CACHE_TTL_MS) {
    return cachedIndex
  }
  const ignored = await loadIgnoreMatcher(cwd)
  const entries: string[] = []
  await walk(cwd, cwd, 0, entries, ignored)
  entries.sort()
  cachedIndex = { cwd, entries }
  cachedAt = now
  return cachedIndex
}

/** Read the workspace-root `.gitignore` and compile it; absent → ignores nothing. */
async function loadIgnoreMatcher(cwd: string): Promise<IgnoreMatcher> {
  try {
    const text = await fs.readFile(join(cwd, '.gitignore'), 'utf8')
    return makeIgnoreMatcher(parseGitignore(text))
  } catch {
    return () => false
  }
}

async function walk(root: string, dir: string, depth: number, out: string[], ignored: IgnoreMatcher): Promise<void> {
  if (depth > MAX_DEPTH || out.length >= MAX_ENTRIES) return
  let dirents
  try {
    dirents = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const dirent of dirents) {
    if (out.length >= MAX_ENTRIES) return
    const name = dirent.name
    if (name.startsWith('.') && name !== '.env' && name !== '.gitignore') continue
    const full = join(dir, name)
    const rel = toPosix(relative(root, full))
    if (dirent.isDirectory()) {
      if (ALWAYS_SKIP.has(name) || ignored(rel, true)) continue
      await walk(root, full, depth + 1, out, ignored)
    } else if (dirent.isFile()) {
      if (ignored(rel, false)) continue
      out.push(rel)
    }
  }
}

function toPosix(p: string): string {
  return sep === '/' ? p : p.split(sep).join('/')
}

export function filterFiles(index: FileIndex, query: string, limit = 8): SuggestionItem[] {
  if (query.length === 0) {
    return index.entries.slice(0, limit).map((path) => ({
      value: `@${path}`,
      label: path,
    }))
  }
  const scored: { path: string; score: number }[] = []
  for (const path of index.entries) {
    const r = fuzzyScore(query, path)
    if (r === null) continue
    scored.push({ path, score: r.score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((s) => ({
    value: `@${s.path}`,
    label: s.path,
  }))
}
