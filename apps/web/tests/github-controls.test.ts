import { describe, expect, test } from 'bun:test'
import { buildControlsCoverage } from '../lib/github/controls'
import { mapRelease } from '../lib/github/releases'

describe('buildControlsCoverage', () => {
  test('marks a control authorized only when the granted level is sufficient', () => {
    const coverage = buildControlsCoverage({ actions: 'write', checks: 'read', contents: 'read' })
    const byLabel = Object.fromEntries(coverage.map((c) => [c.label, c.authorized]))
    expect(byLabel['Workflow runs & re-runs']).toBe(true) // actions: write granted
    expect(byLabel['Pull request checks']).toBe(true) // checks: read granted
    expect(byLabel['Branch protection, runners, environments']).toBe(false) // administration absent
    expect(byLabel['Repository secrets']).toBe(false)
  })

  test('actions read is insufficient for the write-level rerun control', () => {
    const coverage = buildControlsCoverage({ actions: 'read' })
    expect(coverage.find((c) => c.label === 'Workflow runs & re-runs')?.authorized).toBe(false)
  })

  test('every control carries its required permission label', () => {
    const coverage = buildControlsCoverage({})
    expect(coverage.find((c) => c.label === 'Vulnerability alerts')?.permission).toBe('security_events: read')
    expect(coverage.every((c) => c.authorized === false)).toBe(true)
  })
})

describe('mapRelease', () => {
  test('falls back to tag name when the release has no title', () => {
    const release = mapRelease('acme/api', {
      name: null,
      tag_name: 'v1.2.0',
      html_url: 'https://x/releases/v1.2.0',
      published_at: '2026-05-20T00:00:00Z',
      created_at: '2026-05-19T00:00:00Z',
      draft: false,
      prerelease: false,
    })
    expect(release.name).toBe('v1.2.0')
    expect(release.repo).toBe('acme/api')
    expect(release.publishedAt).toBe('2026-05-20T00:00:00Z')
  })
})
