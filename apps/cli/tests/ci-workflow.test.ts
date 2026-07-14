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

describe('regression suite job', () => {
  test('runs the suite as its own job on every PR', () => {
    const text = workflowText()

    expect(text).toContain('regressions:')
    expect(text).toContain('bun run test:regressions --out regression-report.json')
  })

  // Rule 4 in docs/evals/06-REGRESSION-SUITE.md.
  test('encodes the 15-minute suite budget', () => {
    expect(workflowText()).toContain('timeout-minutes: 15')
  })

  // The lazy engine load is the product's contract; CI mirrors it.
  test('installs Chromium only when the suite holds a browser entry', () => {
    const text = workflowText()
    const guard = text.indexOf('bun run test:regressions --list-categories | grep -qx browser')
    const install = text.indexOf('bunx playwright install --with-deps chromium')

    expect(guard).toBeGreaterThan(-1)
    expect(install).toBeGreaterThan(guard)
  })

  test('keeps the report even when the gate fails — it is the checklist evidence', () => {
    const text = workflowText()
    expect(text).toContain('name: regression-report')
    expect(text).toContain('if: always()')
  })
})

describe('quarantine visibility', () => {
  // Rule 2: quarantine is visible, not silent — including on green runs.
  test('publishes the summary to the run itself, not only an artifact', () => {
    const text = workflowText()

    expect(text).toContain('--summary regression-summary.md')
    expect(text).toContain('cat regression-summary.md >> "$GITHUB_STEP_SUMMARY"')
    const publishIndex = text.indexOf('Publish regression summary')
    expect(text.slice(publishIndex, publishIndex + 200)).toContain('if: always()')
  })
})

describe('release:blocker gating', () => {
  test('labels the PR when the gate fails, and can', () => {
    const text = workflowText()

    expect(text).toContain('gh pr edit "$PR_NUMBER" --add-label release:blocker')
    expect(text).toContain('pull-requests: write')
    expect(text).toContain("if: always() && steps.gate.outcome == 'failure'")
  })

  // A broken pipeline is not a blocked release: both exit non-zero, only one is
  // a regression.
  test('labels off the report verdict, not the exit code', () => {
    const text = workflowText()

    expect(text).toContain(`jq -r '.releaseBlocked' regression-report.json`)
    expect(text).toContain('not a release:blocker')
  })

  // LABELS.md: only the owner clears it.
  test('never removes the label', () => {
    expect(workflowText()).not.toContain('--remove-label release:blocker')
  })
})

function workflowText(): string {
  return readFileSync(WORKFLOW_PATH, 'utf8')
}
