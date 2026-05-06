import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const SCRIPT = resolve(import.meta.dir, 'check-fixture-drift.ts')

describe('check-fixture-drift script', () => {
  // Default path: outside the nightly workflow (GITHUB_APP_LIVE != 1) the
  // script must exit 0 with a no-op message. Anything else would break
  // local dev runs of the precommit suite.
  test('exits 0 with a no-op message when GITHUB_APP_LIVE != 1', () => {
    const env: Record<string, string> = { ...process.env } as Record<string, string>
    delete env.GITHUB_APP_LIVE

    const result = spawnSync('bun', ['run', SCRIPT], {
      env,
      encoding: 'utf-8',
      timeout: 10_000,
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('GITHUB_APP_LIVE != 1')
    expect(result.stdout).toContain('no-op')
  })
})
