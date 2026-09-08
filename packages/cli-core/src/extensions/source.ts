import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { lstat, mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const exec = promisify(execFile)

/** Copy regular files only; never follow archive links or execute installation scripts. */
export async function snapshotDirectory(source: string, destination: string): Promise<string> {
  const root = await realpath(source)
  const digest = createHash('sha256')
  let count = 0
  let bytes = 0
  async function copy(from: string, to: string, relative: string): Promise<void> {
    await mkdir(to, { recursive: true, mode: 0o700 })
    for (const entry of (await readdir(from, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue
      if (++count > 10_000) throw new Error('Extension exceeds 10,000 files/directories')
      const src = join(from, entry.name)
      const dst = join(to, entry.name)
      const path = `${relative}/${entry.name}`
      const info = await lstat(src)
      if (info.isSymbolicLink()) throw new Error(`Installed extensions cannot contain symbolic links: ${path}`)
      if (info.isDirectory()) {
        digest.update(`dir:${path}\0`)
        await copy(src, dst, path)
        continue
      }
      if (!info.isFile()) throw new Error(`Extension contains a non-regular file: ${path}`)
      bytes += info.size
      if (bytes > 32 * 1024 * 1024) throw new Error('Extension exceeds 32 MiB')
      const content = await readFile(src)
      bytes += content.length - info.size
      if (bytes > 32 * 1024 * 1024) throw new Error('Extension exceeds 32 MiB')
      const mode = info.mode & 0o755
      digest.update(path).update('\0').update(String(mode)).update('\0').update(content).update('\0')
      await writeFile(dst, content, { mode })
    }
  }
  await copy(root, destination, '')
  return digest.digest('hex')
}

export async function materializeSource(
  source: string,
  temporary: string,
): Promise<{ directory: string; revision?: string; source: string }> {
  if (!source.startsWith('https://'))
    return { directory: await realpath(resolve(source)), source: await realpath(resolve(source)) }
  const url = new URL(source)
  if (url.username || url.password) throw new Error('Git source URLs must not embed credentials')
  const revision = url.hash.slice(1)
  if (!/^[a-f0-9]{40}$/i.test(revision))
    throw new Error('Git installations require an immutable commit: https://host/repo.git#<40-character-commit>')
  url.hash = ''
  const directory = join(temporary, 'checkout')
  await mkdir(directory)
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
  }
  const git = (args: string[]): Promise<{ stdout: string; stderr: string }> =>
    exec(
      'git',
      ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'protocol.file.allow=never', ...args],
      { cwd: directory, env, timeout: 60_000, maxBuffer: 1024 * 1024 },
    )
  await git(['init', '--quiet'])
  await git(['fetch', '--quiet', '--depth=1', '--', url.href, revision])
  await git(['checkout', '--quiet', '--detach', 'FETCH_HEAD'])
  const actual = (await git(['rev-parse', 'HEAD'])).stdout.trim()
  if (actual.toLowerCase() !== revision.toLowerCase())
    throw new Error('Git revision did not match the requested commit')
  return { directory, revision: actual, source }
}
