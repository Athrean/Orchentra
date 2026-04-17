import { mkdir, readdir, readFile, stat } from 'node:fs/promises'
import { createWriteStream, type WriteStream } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { RuntimeEvent } from './events'

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
