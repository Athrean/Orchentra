import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Open `initialContent` in the user's `$EDITOR` and return the edited body
 * once the editor exits.
 *
 * Fallback chain: `$EDITOR` → `$VISUAL` → `vim`.
 *
 * Returns:
 *  - the edited file's contents on a zero-exit editor run, OR
 *  - `null` if the editor exited non-zero (caller should treat as cancelled
 *    and keep the existing buffer).
 *
 * The tmpfile is always deleted before returning, even when the editor
 * exited non-zero or threw — we never leak `orchentra-edit-*.md` blobs
 * into `$TMPDIR`.
 */
export async function openInEditor(initialContent: string): Promise<string | null> {
  const editor = process.env['EDITOR'] || process.env['VISUAL'] || 'vim'
  const path = join(tmpdir(), `orchentra-edit-${randomBytes(6).toString('hex')}.md`)
  await fs.writeFile(path, initialContent, 'utf8')
  try {
    // Pass `env` explicitly: Bun's `spawnSync` does not inherit `process.env`
    // by default the way Node does, so callers that rely on env-based
    // configuration (e.g. test scaffolding) would not see their vars in
    // the child.
    const result = spawnSync(editor, [path], { stdio: 'inherit', env: process.env })
    if (result.error) return null
    if (typeof result.status !== 'number' || result.status !== 0) return null
    return await fs.readFile(path, 'utf8')
  } finally {
    await fs.unlink(path).catch(() => {
      /* best-effort cleanup */
    })
  }
}
