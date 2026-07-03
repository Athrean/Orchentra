import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const WORKFLOW_PATH = join(import.meta.dir, '..', '..', '..', '.github', 'workflows', 'ci.yml')

describe('PR CI workflow', () => {
  test('runs on pull requests only', () => {
    const text = workflowText()

    expect(text).toContain('pull_request:')
    expect(text).not.toContain('push:')
    expect(text).not.toContain('workflow_dispatch:')
  })

  test('runs leak guard before package manager work', () => {
    const text = workflowText()
    const leakGuardIndex = text.indexOf('sh scripts/check-ref-leaks.sh')
    const installIndex = text.indexOf('bun install --frozen-lockfile')

    expect(leakGuardIndex).toBeGreaterThan(-1)
    expect(installIndex).toBeGreaterThan(-1)
    expect(leakGuardIndex).toBeLessThan(installIndex)
  })

  test('runs validation gates and packed CLI smoke', () => {
    const text = workflowText()

    expect(text).toContain('bun run typecheck')
    expect(text).toContain('bun run lint')
    expect(text).toContain('bun run test:precommit')
    expect(text).toContain('bun run build')
    expect(text).toContain('bun run --cwd apps/cli test:smoke')
  })
})

function workflowText(): string {
  return readFileSync(WORKFLOW_PATH, 'utf8')
}
