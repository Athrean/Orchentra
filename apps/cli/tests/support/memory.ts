import type { PatternEntry } from '@orchentra/cli-core'

/**
 * A PatternEntry with every required field filled in.
 *
 * Five test suites were each writing out all ten fields to vary the two they
 * cared about. Defaults here are inert placeholders; pass anything the test
 * asserts on through `overrides`.
 */
export function makePatternEntry(id: string, overrides: Partial<PatternEntry> = {}): PatternEntry {
  return {
    id,
    orgId: 'default',
    incidentId: null,
    embedding: [],
    pattern: 'default pattern',
    resolution: 'default resolution',
    failureType: 'code_bug',
    usageCount: 0,
    lastMatchedAt: null,
    createdAt: '2026-06-26T00:00:00.000Z',
    ...overrides,
  }
}
