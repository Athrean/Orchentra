import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ToolArtifact, ToolEvidence, ToolResultPayload } from './events'
import type { ImageContent } from './image'
import { MigrationError, runMigrations } from './migrations'
import { redactPersistedData } from './trace'

export const CURRENT_CONTEXT_MANIFEST_VERSION = 2

export type ContextTrust = 'trusted' | 'untrusted'
export type ContextKind = 'text' | 'json' | 'tool-result' | 'artifact'
export type ContextProvenanceKind =
  'user-input' | 'system-reference' | 'tool-result' | 'browser-snapshot' | 'artifact' | 'model'

export interface ContextProvenance {
  readonly kind: ContextProvenanceKind
  readonly sourceId?: string
  readonly label?: string
}

export interface ContextValue {
  readonly text?: string
  readonly data?: unknown
  readonly images?: readonly ImageContent[]
  readonly evidence?: readonly ToolEvidence[]
  readonly artifacts?: readonly ToolArtifact[]
  readonly isError?: boolean
}

export interface ContextSeed {
  readonly kind: ContextKind
  readonly trust: ContextTrust
  readonly provenance: ContextProvenance
  readonly value: ContextValue
  readonly summary?: string
}

export interface ContextDescriptor {
  readonly handle: string
  readonly runId: string
  readonly kind: ContextKind
  readonly trust: ContextTrust
  readonly provenance: ContextProvenance
  readonly summary: string
  readonly bytes: number
  readonly textChars: number
  readonly hasImages: boolean
  readonly evidenceCount: number
  readonly artifactCount: number
  readonly createdAt: string
}

export interface ContextReadResult {
  readonly descriptor: ContextDescriptor
  readonly text: string
  readonly offset: number
  readonly nextOffset: number | null
  readonly truncated: boolean
  readonly data?: unknown
  readonly images?: readonly ImageContent[]
  readonly evidence?: readonly ToolEvidence[]
  readonly artifacts?: readonly ToolArtifact[]
  readonly isError?: boolean
}

export interface ContextSearchMatch {
  readonly offset: number
  readonly end: number
  readonly excerpt: string
}

export interface ContextSearchResult {
  readonly descriptor: ContextDescriptor
  readonly query: string
  readonly matches: readonly ContextSearchMatch[]
  readonly truncated: boolean
}

export interface ContextStoreLimits {
  readonly maxEntries: number
  readonly maxTotalBytes: number
  readonly maxEntryBytes: number
  readonly maxReadChars: number
  readonly maxSearchMatches: number
  readonly maxQueryChars: number
}

export const DEFAULT_CONTEXT_STORE_LIMITS: ContextStoreLimits = {
  maxEntries: 256,
  maxTotalBytes: 25 * 1024 * 1024,
  maxEntryBytes: 5 * 1024 * 1024,
  maxReadChars: 12_000,
  maxSearchMatches: 50,
  maxQueryChars: 256,
}

export interface ContextStoreSnapshot {
  readonly runId: string
  readonly entryCount: number
  readonly totalBytes: number
  readonly closed: boolean
  readonly manifestPath: string | null
}

export interface ContextManifest {
  readonly version: 2
  readonly runId: string
  readonly createdAt: string
  readonly closedAt: string | null
  readonly totalBytes: number
  readonly entries: readonly ContextDescriptor[]
}

interface StoredContextRecord {
  readonly version: 2
  readonly descriptor: ContextDescriptor
  readonly value: ContextValue
}

interface ContextRecord {
  readonly descriptor: ContextDescriptor
  readonly value: ContextValue
}

export class ContextStoreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ContextStoreError'
  }
}

export class RunContextStore {
  private readonly records = new Map<string, ContextRecord>()
  private readonly limits: ContextStoreLimits
  private readonly createdAt: string
  private totalBytes = 0
  private nextOrdinal = 1
  private closedAt: string | null = null

  constructor(
    readonly runId: string,
    private readonly options: {
      readonly persistRoot?: string
      readonly limits?: Partial<ContextStoreLimits>
      readonly clock?: () => string
    } = {},
  ) {
    if (!runId.trim()) throw new ContextStoreError('Context store run id must not be empty.')
    this.limits = { ...DEFAULT_CONTEXT_STORE_LIMITS, ...options.limits }
    validateLimits(this.limits)
    this.createdAt = this.now()
  }

  async store(seed: ContextSeed): Promise<ContextDescriptor> {
    this.assertOpen()
    validateSeed(seed)
    if (this.records.size >= this.limits.maxEntries) {
      throw new ContextStoreError(`Context entry quota exceeded (${this.limits.maxEntries}).`)
    }

    const value = cloneJsonValue(seed.value) as ContextValue
    const serialized = serialize(value)
    const bytes = Buffer.byteLength(serialized, 'utf8')
    if (bytes > this.limits.maxEntryBytes) {
      throw new ContextStoreError(`Context entry exceeds the ${this.limits.maxEntryBytes}-byte cap (${bytes}).`)
    }
    if (this.totalBytes + bytes > this.limits.maxTotalBytes) {
      throw new ContextStoreError(`Context store exceeds the ${this.limits.maxTotalBytes}-byte run cap.`)
    }

    const ordinal = this.nextOrdinal++
    const handle = contextHandle(this.runId, ordinal, serialized)
    const descriptor: ContextDescriptor = {
      handle,
      runId: this.runId,
      kind: seed.kind,
      trust: seed.trust,
      provenance: { ...seed.provenance },
      summary: normalizeSummary(seed.summary ?? defaultSummary(seed, ordinal)),
      bytes,
      textChars: searchableText(value).length,
      hasImages: (value.images?.length ?? 0) > 0,
      evidenceCount: value.evidence?.length ?? 0,
      artifactCount: value.artifacts?.length ?? 0,
      createdAt: this.now(),
    }
    this.records.set(handle, { descriptor, value })
    this.totalBytes += bytes
    await this.persistRecord({ version: CURRENT_CONTEXT_MANIFEST_VERSION, descriptor, value })
    await this.persistManifest()
    return descriptor
  }

  async storeToolResult(result: ToolResultPayload, toolName: string): Promise<ContextDescriptor> {
    const isBrowserSnapshot = result.content.startsWith('[browser_snapshot]')
    return this.store({
      kind: 'tool-result',
      trust: 'untrusted',
      provenance: {
        kind: isBrowserSnapshot ? 'browser-snapshot' : 'tool-result',
        sourceId: result.id,
        label: toolName,
      },
      summary: `${toolName} result (${result.content.length} chars)`,
      value: {
        text: result.content,
        data: result.data,
        images: result.images,
        artifacts: result.artifacts,
        evidence: result.evidence,
        isError: result.isError,
      },
    })
  }

  list(limit = this.limits.maxEntries): readonly ContextDescriptor[] {
    this.assertOpen()
    if (!Number.isInteger(limit) || limit < 1) throw new ContextStoreError('Context list limit must be positive.')
    return Array.from(this.records.values())
      .slice(0, Math.min(limit, this.limits.maxEntries))
      .map((record) => record.descriptor)
  }

  read(handle: string, offset = 0, limit = this.limits.maxReadChars): ContextReadResult {
    this.assertOpen()
    const record = this.requireRecord(handle)
    if (!Number.isInteger(offset) || offset < 0)
      throw new ContextStoreError('Context read offset must be non-negative.')
    if (!Number.isInteger(limit) || limit < 1 || limit > this.limits.maxReadChars) {
      throw new ContextStoreError(`Context read limit must be between 1 and ${this.limits.maxReadChars}.`)
    }
    const full = searchableText(record.value)
    const text = full.slice(offset, offset + limit)
    const nextOffset = offset + text.length < full.length ? offset + text.length : null
    return {
      descriptor: record.descriptor,
      text,
      offset,
      nextOffset,
      truncated: nextOffset !== null,
      ...(record.value.data !== undefined ? { data: cloneJsonValue(record.value.data) } : {}),
      ...(record.value.images ? { images: cloneJsonValue(record.value.images) as ImageContent[] } : {}),
      ...(record.value.evidence ? { evidence: cloneJsonValue(record.value.evidence) as ToolEvidence[] } : {}),
      ...(record.value.artifacts ? { artifacts: cloneJsonValue(record.value.artifacts) as ToolArtifact[] } : {}),
      ...(record.value.isError !== undefined ? { isError: record.value.isError } : {}),
    }
  }

  search(handle: string, query: string, limit = this.limits.maxSearchMatches): ContextSearchResult {
    this.assertOpen()
    const record = this.requireRecord(handle)
    const needle = query.trim()
    if (!needle) throw new ContextStoreError('Context search query must not be empty.')
    if (needle.length > this.limits.maxQueryChars) {
      throw new ContextStoreError(`Context search query exceeds ${this.limits.maxQueryChars} characters.`)
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > this.limits.maxSearchMatches) {
      throw new ContextStoreError(`Context search limit must be between 1 and ${this.limits.maxSearchMatches}.`)
    }

    const haystack = searchableText(record.value)
    const lowerHaystack = haystack.toLocaleLowerCase()
    const lowerNeedle = needle.toLocaleLowerCase()
    const matches: ContextSearchMatch[] = []
    let from = 0
    let hasMore = false
    while (from <= lowerHaystack.length - lowerNeedle.length) {
      const offset = lowerHaystack.indexOf(lowerNeedle, from)
      if (offset < 0) break
      if (matches.length >= limit) {
        hasMore = true
        break
      }
      const end = offset + needle.length
      matches.push({
        offset,
        end,
        excerpt: haystack.slice(Math.max(0, offset - 80), Math.min(haystack.length, end + 80)),
      })
      from = Math.max(end, offset + 1)
    }
    return { descriptor: record.descriptor, query: needle, matches, truncated: hasMore }
  }

  snapshot(): ContextStoreSnapshot {
    return {
      runId: this.runId,
      entryCount: this.records.size,
      totalBytes: this.totalBytes,
      closed: this.closedAt !== null,
      manifestPath: this.options.persistRoot ? join(this.options.persistRoot, 'manifest.json') : null,
    }
  }

  async close(): Promise<void> {
    if (this.closedAt) return
    this.closedAt = this.now()
    await this.persistManifest()
  }

  private requireRecord(handle: string): ContextRecord {
    const ownPrefix = `ctx_${runTag(this.runId)}_`
    if (!handle.startsWith(ownPrefix)) throw new ContextStoreError('Context handle belongs to a different run.')
    const record = this.records.get(handle)
    if (!record) throw new ContextStoreError(`Unknown context handle: ${handle}`)
    return record
  }

  private assertOpen(): void {
    if (this.closedAt) throw new ContextStoreError('Context store is closed; run-scoped handles are no longer valid.')
  }

  private now(): string {
    return this.options.clock?.() ?? new Date().toISOString()
  }

  private async persistRecord(record: StoredContextRecord): Promise<void> {
    if (!this.options.persistRoot) return
    await mkdir(join(this.options.persistRoot, 'entries'), { recursive: true })
    const path = join(this.options.persistRoot, 'entries', `${record.descriptor.handle}.json`)
    await writeFile(path, `${JSON.stringify(redactPersistedData(record), null, 2)}\n`, 'utf8')
  }

  private async persistManifest(): Promise<void> {
    if (!this.options.persistRoot) return
    await mkdir(this.options.persistRoot, { recursive: true })
    const manifest: ContextManifest = {
      version: CURRENT_CONTEXT_MANIFEST_VERSION,
      runId: this.runId,
      createdAt: this.createdAt,
      closedAt: this.closedAt,
      totalBytes: this.totalBytes,
      entries: Array.from(this.records.values()).map((record) => record.descriptor),
    }
    const path = join(this.options.persistRoot, 'manifest.json')
    const temporary = join(this.options.persistRoot, 'manifest.json.tmp')
    await writeFile(temporary, `${JSON.stringify(redactPersistedData(manifest), null, 2)}\n`, 'utf8')
    await rename(temporary, path)
  }
}

export function contextStoreRoot(cwd: string, traceId: string): string {
  return join(cwd, '.orchentra', 'traces', traceId, 'context')
}

const CONTEXT_HANDLE_PATTERN = /ctx_[a-f0-9]{10}_[a-z0-9]+_[a-f0-9]{10}/g

/** Make prior-run handles visibly unusable without rewriting tool-call payloads. */
export function expireContextHandles(content: string): string {
  return content.replace(CONTEXT_HANDLE_PATTERN, '[expired context handle from prior run]')
}

export async function loadContextManifest(path: string): Promise<ContextManifest> {
  const raw = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
  const migrated = runMigrations(raw, {
    current: CURRENT_CONTEXT_MANIFEST_VERSION,
    migrations: {
      1: (value) => ({ ...value, closedAt: value.closedAt ?? null }),
    },
  })
  if (
    migrated.version !== CURRENT_CONTEXT_MANIFEST_VERSION ||
    typeof migrated.runId !== 'string' ||
    typeof migrated.createdAt !== 'string' ||
    !(typeof migrated.closedAt === 'string' || migrated.closedAt === null) ||
    typeof migrated.totalBytes !== 'number' ||
    !Array.isArray(migrated.entries)
  ) {
    throw new MigrationError('Invalid context manifest after migration.')
  }
  return migrated as unknown as ContextManifest
}

function validateLimits(limits: ContextStoreLimits): void {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isInteger(value) || value < 1) throw new ContextStoreError(`Context limit ${name} must be positive.`)
  }
}

function validateSeed(seed: ContextSeed): void {
  if (!['text', 'json', 'tool-result', 'artifact'].includes(seed.kind)) {
    throw new ContextStoreError(`Unsupported context kind: ${String(seed.kind)}`)
  }
  if (seed.trust !== 'trusted' && seed.trust !== 'untrusted') {
    throw new ContextStoreError(`Unsupported context trust class: ${String(seed.trust)}`)
  }
  if (!seed.provenance?.kind) throw new ContextStoreError('Context provenance is required.')
}

function defaultSummary(seed: ContextSeed, ordinal: number): string {
  return `${seed.provenance.label ?? seed.provenance.kind} ${seed.kind} #${ordinal}`
}

function normalizeSummary(summary: string): string {
  const normalized = summary.replace(/\s+/g, ' ').trim()
  return normalized.slice(0, 240) || 'context entry'
}

function searchableText(value: ContextValue): string {
  if (typeof value.text === 'string') return value.text
  if (value.data !== undefined) return serialize(value.data)
  return ''
}

function serialize(value: unknown): string {
  try {
    const serialized = JSON.stringify(value)
    if (serialized === undefined) throw new Error('undefined is not serializable')
    return serialized
  } catch (error) {
    throw new ContextStoreError(
      `Context value must be JSON-serializable: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function cloneJsonValue(value: unknown): unknown {
  return JSON.parse(serialize(value)) as unknown
}

function runTag(runId: string): string {
  return createHash('sha256').update(runId).digest('hex').slice(0, 10)
}

function contextHandle(runId: string, ordinal: number, serialized: string): string {
  const contentTag = createHash('sha256').update(serialized).digest('hex').slice(0, 10)
  return `ctx_${runTag(runId)}_${ordinal.toString(36)}_${contentTag}`
}
