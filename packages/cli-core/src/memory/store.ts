import { join, dirname } from 'node:path'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { defaultConfigHome } from '../runtime/config'
import type { PatternEntry, MemoryStore } from './types'

export class PatternStoreError extends Error {
  readonly filePath: string

  constructor(filePath: string, message: string) {
    super(`Pattern store error at ${filePath}: ${message}`)
    this.name = 'PatternStoreError'
    this.filePath = filePath
  }
}

export class PatternStore implements MemoryStore {
  constructor(private readonly basePath: string = join(defaultConfigHome(), 'memory')) {}

  save(orgId: string, entry: PatternEntry): void {
    const filePath = this.orgFile(orgId)
    const entries = this.readOrgFile(filePath)
    entries.push(entry)
    this.writeOrgFile(filePath, entries)
  }

  load(orgId: string): PatternEntry[] {
    return this.readOrgFile(this.orgFile(orgId))
  }

  updateUsage(orgId: string, entryId: string): void {
    this.updateUsageBatch(orgId, [entryId])
  }

  updateUsageBatch(orgId: string, entryIds: string[]): void {
    if (entryIds.length === 0) return
    const filePath = this.orgFile(orgId)
    const entries = this.readOrgFile(filePath)
    const increments = new Map<string, number>()
    for (const entryId of entryIds) {
      increments.set(entryId, (increments.get(entryId) ?? 0) + 1)
    }
    let didUpdate = false
    const matchedAt = new Date().toISOString()
    for (let i = 0; i < entries.length; i++) {
      const delta = increments.get(entries[i].id)
      if (!delta) continue
      entries[i] = {
        ...entries[i],
        usageCount: entries[i].usageCount + delta,
        lastMatchedAt: matchedAt,
      }
      didUpdate = true
    }
    if (didUpdate) this.writeOrgFile(filePath, entries)
  }

  delete(orgId: string, entryId: string): void {
    const filePath = this.orgFile(orgId)
    const entries = this.readOrgFile(filePath)
    const filtered = entries.filter((e) => e.id !== entryId)
    if (filtered.length !== entries.length) {
      this.writeOrgFile(filePath, filtered)
    }
  }

  has(orgId: string, incidentId: string): boolean {
    return this.load(orgId).some((e) => e.incidentId === incidentId)
  }

  private orgFile(orgId: string): string {
    return join(this.basePath, orgId, 'patterns.json')
  }

  private readOrgFile(filePath: string): PatternEntry[] {
    let contents: string
    try {
      contents = readFileSync(filePath, 'utf-8')
    } catch (error) {
      if (isErrnoCode(error, 'ENOENT')) return []
      throw new PatternStoreError(filePath, `read failed: ${error instanceof Error ? error.message : String(error)}`)
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(contents)
    } catch {
      throw new PatternStoreError(filePath, 'corrupt patterns file — invalid JSON')
    }
    if (!Array.isArray(parsed)) {
      throw new PatternStoreError(filePath, 'corrupt patterns file — expected JSON array')
    }
    return parsed as PatternEntry[]
  }

  private writeOrgFile(filePath: string, entries: PatternEntry[]): void {
    const parent = dirname(filePath)
    mkdirSync(parent, { recursive: true })
    const tempPath = join(parent, `.patterns-${process.pid}-${Date.now()}.tmp`)
    try {
      writeFileSync(tempPath, JSON.stringify(entries, null, 2), 'utf-8')
      renameSync(tempPath, filePath)
    } catch (error) {
      throw new PatternStoreError(filePath, `write failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      if (existsSync(tempPath)) unlinkSync(tempPath)
    }
  }
}

function isErrnoCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === code
  )
}
