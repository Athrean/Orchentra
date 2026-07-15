import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { failureSignature, type FailureSignature } from '../memory/failure-signature'
import type { GateDecisionRecord, RunState } from './run-state'

export interface QuarantineRecord {
  readonly path: string
  readonly signature: FailureSignature
}

/** Persist partial pass^k outcomes loudly; flakes never disappear into retries. */
export async function quarantineRun(
  cwd: string,
  state: RunState,
  decision: GateDecisionRecord,
): Promise<QuarantineRecord> {
  const failed = decision.trials
    .filter((trial) => !trial.passed)
    .map((trial) => trial.summary)
    .join('\n')
  const signature = failureSignature({
    workflowName: 'completion-gate',
    stepName: state.goal,
    log: failed || decision.summary,
  })
  const dir = join(cwd, '.orchentra', 'quarantine')
  await mkdir(dir, { recursive: true })
  const path = join(dir, `${signature.hash}.json`)
  await writeFile(
    path,
    `${JSON.stringify({ signature, goal: state.goal, gateDecision: decision, runState: state }, null, 2)}\n`,
    'utf8',
  )
  return { path, signature }
}
