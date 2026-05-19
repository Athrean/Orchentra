import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { normalize, sep } from 'node:path'

/**
 * Stable, platform-deterministic hash of a workspace's absolute path.
 *
 * Two concurrent REPLs in different worktrees of the same repo must NOT write
 * to the same `~/.orchentra/sessions/` directory — otherwise they race on
 * session ids. The fingerprint is the per-workspace bucket key.
 *
 * Inputs are canonicalised before hashing so that trivial path noise
 * (trailing slashes, redundant separators, intermediate symlinks) does not
 * fragment a single workspace across multiple buckets.
 *
 * Returns a 16-char hex prefix of SHA-256. 64 bits of distinguishing power
 * is overkill for "is this the same directory" but cheap and far below the
 * collision threshold for any realistic per-user workspace count.
 */
export function fingerprintWorkspace(absolutePath: string): string {
  const canonical = canonicaliseWorkspacePath(absolutePath)
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16)
}

function canonicaliseWorkspacePath(input: string): string {
  // Collapse `//`, `./`, etc.
  let path = normalize(input)
  // Resolve any symlinks in the chain. realpath fails on non-existent paths,
  // in which case we fall back to the normalized lexical form. That keeps the
  // helper usable for fingerprinting paths that haven't been created yet
  // (tests, dry-runs) without changing the result for real workspaces.
  try {
    path = realpathSync(path)
  } catch {
    /* ignore — non-existent path, use lexical form */
  }
  // Strip a single trailing separator so '/foo' and '/foo/' agree. Don't
  // strip the root separator itself.
  if (path.length > 1 && path.endsWith(sep)) {
    path = path.slice(0, -sep.length)
  }
  return path
}
