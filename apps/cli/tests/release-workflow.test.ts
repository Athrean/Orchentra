import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const WORKFLOW_PATH = join(import.meta.dir, '..', '..', '..', '.github', 'workflows', 'publish-cli.yml')

describe('CLI npm release workflow', () => {
  test('is manually dispatched only', () => {
    const text = workflowText()

    expect(text).toContain('workflow_dispatch:')
    expect(text).not.toContain('pull_request:')
    expect(text).not.toContain('push:')
  })

  test('defaults to dry run and exposes release channels', () => {
    const text = workflowText()

    expect(text).toContain('dry_run:')
    expect(text).toContain('default: true')
    expect(text).toContain('npm_tag:')
    expect(text).toContain('- alpha')
    expect(text).toContain('- beta')
    expect(text).toContain('- latest')
  })

  test('runs the package dry run before any publish command', () => {
    const text = workflowText()
    const dryRunIndex = text.indexOf('bun run --cwd apps/cli package:dry-run')
    const publishIndex = text.indexOf('npm publish --workspace apps/cli')

    expect(dryRunIndex).toBeGreaterThan(-1)
    expect(publishIndex).toBeGreaterThan(-1)
    expect(dryRunIndex).toBeLessThan(publishIndex)
  })

  test('real publish is token-gated and channel-tagged', () => {
    const text = workflowText()

    expect(text).toContain('if: ${{ inputs.dry_run == false }}')
    expect(text).toContain('NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}')
    expect(text).toContain('--tag "${{ inputs.npm_tag }}"')
    expect(text).toContain('--access public')
  })
})

function workflowText(): string {
  return readFileSync(WORKFLOW_PATH, 'utf8')
}
