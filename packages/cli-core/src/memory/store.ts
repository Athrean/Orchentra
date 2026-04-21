import { join, dirname } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { defaultConfigHome } from '../runtime/config'
import type { PatternEntry, MemoryStore } from './types'

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
    const filePath = this.orgFile(orgId)
    const entries = this.readOrgFile(filePath)
    const idx = entries.findIndex((e) => e.id === entryId)
    if (idx === -1) return
    entries[idx] = {
      ...entries[idx],
      usageCount: entries[idx].usageCount + 1,
      lastMatchedAt: new Date().toISOString(),
    }
    this.writeOrgFile(filePath, entries)
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
    try {
      const contents = readFileSync(filePath, 'utf-8')
      const parsed = JSON.parse(contents)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  private writeOrgFile(filePath: string, entries: PatternEntry[]): void {
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, JSON.stringify(entries, null, 2))
  }
}
