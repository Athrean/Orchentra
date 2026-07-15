import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { traceManifestPath } from './trace'
import type { GateDecisionRecord, RunState } from './run-state'

export interface EmittedSpec {
  readonly path: string
}

export function traceSpecPath(cwd: string, traceId: string): string {
  return join(cwd, '.orchentra', 'specs', `${traceId}.spec.ts`)
}

/** Turn an approved trace manifest into a deterministic, replayable Bun spec. */
export async function emitTraceSpec(input: {
  readonly cwd: string
  readonly traceId: string
  readonly state: RunState
  readonly decision: GateDecisionRecord
}): Promise<EmittedSpec> {
  const manifestPath = traceManifestPath(input.cwd, input.traceId)
  const manifest = await readFile(manifestPath, 'utf8')
  const parsed = JSON.parse(manifest) as { gateDecisions?: Array<{ outcome?: string }> }
  const lastDecision = parsed.gateDecisions?.[parsed.gateDecisions.length - 1]
  if (lastDecision?.outcome !== 'pass') {
    throw new Error(`trace ${input.traceId} is not gate-approved; refusing to emit replay spec`)
  }
  const path = traceSpecPath(input.cwd, input.traceId)
  await mkdir(dirname(path), { recursive: true })
  const source = [
    "import { describe, expect, test } from 'bun:test'",
    "import { readFile } from 'node:fs/promises'",
    '',
    `const traceManifestPath = ${JSON.stringify(manifestPath)}`,
    `const goal = ${JSON.stringify(input.state.goal)}`,
    `const expectedPasses = ${input.decision.trials.filter((trial) => trial.passed).length}`,
    `const expectedTrials = ${input.decision.trials.length}`,
    '',
    "describe('gate-verified replay', () => {",
    '  test(goal, async () => {',
    "    const manifest = JSON.parse(await readFile(traceManifestPath, 'utf8')) as { gateDecisions: Array<{ outcome: string }> }",
    "    expect(manifest.gateDecisions.at(-1)?.outcome).toBe('pass')",
    '    expect(expectedPasses).toBe(expectedTrials)',
    '  })',
    '})',
    '',
    `// Source trace manifest: ${manifestPath}`,
    '',
  ].join('\n')
  await writeFile(path, source, 'utf8')
  return { path }
}
