import { mkdir, readdir, readFile, stat, rename, unlink } from 'node:fs/promises'
import { createWriteStream, existsSync, writeFileSync, type WriteStream } from 'node:fs'
import { join, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { RuntimeEvent } from './events'

const MAX_SESSION_SIZE = 256 * 1024
const MAX_ROTATED_FILES = 3
const ROTATION_CHECK_INTERVAL = 10

export interface SessionMeta {
  id: string
  createdAt: string
  cwd: string
  model: string
}

export interface SessionRecord {
  meta: SessionMeta
  event: RuntimeEvent
  at: string
}

export interface SessionWriterOptions {
  rootDir?: string
  id?: string
  meta: Omit<SessionMeta, 'id' | 'createdAt'>
}

export class SessionWriter {
  readonly meta: SessionMeta
  readonly path: string
  private stream: WriteStream | null = null
  private opening: Promise<void> | null = null
  private appendCount = 0

  private constructor(meta: SessionMeta, path: string) {
    this.meta = meta
    this.path = path
  }

  static async open(options: SessionWriterOptions): Promise<SessionWriter> {
    const root = options.rootDir ?? defaultSessionDir()
    await mkdir(root, { recursive: true })
    const id = options.id ?? randomUUID()
    const meta: SessionMeta = {
      id,
      createdAt: new Date().toISOString(),
      cwd: options.meta.cwd,
      model: options.meta.model,
    }
    const path = join(root, `${id}.jsonl`)
    const writer = new SessionWriter(meta, path)
    writer.stream = createWriteStream(path, { flags: 'a' })
    return writer
  }

  async append(event: RuntimeEvent): Promise<void> {
    const line: SessionRecord = {
      meta: this.meta,
      event,
      at: new Date().toISOString(),
    }
    await this.write(`${JSON.stringify(line)}\n`)
    this.appendCount++
    if (this.appendCount % ROTATION_CHECK_INTERVAL === 0) {
      await this.rotateIfNeeded()
    }
  }

  async fork(newId?: string): Promise<SessionWriter> {
    await this.close()
    const raw = await readFile(this.path, 'utf8')
    const id = newId ?? randomUUID()
    const meta: SessionMeta = {
      id,
      createdAt: new Date().toISOString(),
      cwd: this.meta.cwd,
      model: this.meta.model,
    }
    const lines = raw.split('\n').filter((l) => l.length > 0)
    const newLines = lines.map((line) => {
      const record = JSON.parse(line) as SessionRecord
      return JSON.stringify({ ...record, meta, at: new Date().toISOString() })
    })
    const newPath = join(dirname(this.path), `${id}.jsonl`)
    writeFileSync(newPath, newLines.join('\n') + '\n')

    const writer = new SessionWriter(meta, newPath)
    writer.stream = createWriteStream(newPath, { flags: 'a' })
    // Reopen this writer too
    this.stream = createWriteStream(this.path, { flags: 'a' })
    return writer
  }

  async close(): Promise<void> {
    const s = this.stream
    if (!s) return
    await new Promise<void>((resolve) => s.end(resolve))
    this.stream = null
  }

  private write(chunk: string): Promise<void> {
    const s = this.stream
    if (!s) throw new Error('session writer closed')
    if (this.opening) return this.opening.then(() => this.writeNow(s, chunk))
    return this.writeNow(s, chunk)
  }

  private writeNow(s: WriteStream, chunk: string): Promise<void> {
    return new Promise((resolve, reject) => {
      s.write(chunk, (err) => (err ? reject(err) : resolve()))
    })
  }

  private async rotateIfNeeded(): Promise<void> {
    try {
      const s = await stat(this.path).catch(() => null)
      if (!s || s.size < MAX_SESSION_SIZE) return

      await this.close()

      // Drop the oldest rotated file so subsequent renames never target an
      // existing path (on Windows this silently failed previously).
      const oldestPath = `${this.path}.${MAX_ROTATED_FILES}`
      if (existsSync(oldestPath)) {
        await unlink(oldestPath).catch(() => undefined)
      }

      for (let i = MAX_ROTATED_FILES - 1; i >= 1; i--) {
        const oldPath = `${this.path}.${i}`
        const newPath = `${this.path}.${i + 1}`
        if (existsSync(oldPath)) {
          if (existsSync(newPath)) await unlink(newPath).catch(() => undefined)
          await rename(oldPath, newPath)
        }
      }
      const firstRotated = `${this.path}.1`
      if (existsSync(firstRotated)) await unlink(firstRotated).catch(() => undefined)
      await rename(this.path, firstRotated)

      this.stream = createWriteStream(this.path, { flags: 'a' })
    } catch (err) {
      // Rotation failure is non-fatal but should not silently leave the writer
      // in a broken state — re-open the stream if we closed it above.
      if (!this.stream) {
        try {
          this.stream = createWriteStream(this.path, { flags: 'a' })
        } catch {
          // Ignore — next write will surface the underlying error.
        }
      }
      if (process.env.ORCHENTRA_DEBUG) {
        process.stderr.write(`[session] rotation failed: ${(err as Error).message}\n`)
      }
    }
  }
}

export async function replaySession(path: string): Promise<SessionRecord[]> {
  const raw = await readFile(path, 'utf8')
  const lines = raw.split('\n').filter((l) => l.length > 0)
  return lines.map((line) => JSON.parse(line) as SessionRecord)
}

export async function resolveSessionPath(idOrLatest: string, rootDir: string = defaultSessionDir()): Promise<string> {
  if (idOrLatest !== 'latest') {
    return join(rootDir, `${idOrLatest}.jsonl`)
  }
  const entries = await readdir(rootDir)
  const files = entries.filter((e) => e.endsWith('.jsonl'))
  if (files.length === 0) {
    throw new Error(`no sessions found in ${rootDir}`)
  }
  const stats = await Promise.all(files.map(async (f) => ({ f, s: await stat(join(rootDir, f)) })))
  stats.sort((a, b) => b.s.mtimeMs - a.s.mtimeMs)
  return join(rootDir, stats[0]!.f)
}

export function defaultSessionDir(): string {
  return join(process.cwd(), '.orchentra', 'sessions')
}
