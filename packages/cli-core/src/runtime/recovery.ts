import { classifyStartupFailure, type StartupEvidenceBundle } from './worker-boot'
import type { LaneFailureClass } from './lane-events'

export type RecoveryAction = 'retry' | 'replan' | 'reraise'

export interface RecoveryDecision {
  readonly failureClass: LaneFailureClass
  readonly action: RecoveryAction
  readonly summary: string
}

/**
 * Adapter over established lane/startup taxonomy. It makes runtime recovery
 * decisions without creating a second, incompatible set of failure classes.
 */
export function classifyRecovery(input: {
  readonly toolName?: string
  readonly message: string
  readonly startupEvidence?: StartupEvidenceBundle
}): RecoveryDecision {
  if (input.startupEvidence) {
    const kind = classifyStartupFailure(input.startupEvidence)
    if (kind === 'trust_required')
      return { failureClass: 'plugin_startup', action: 'reraise', summary: 'startup trust gate needs user action' }
    return { failureClass: 'plugin_startup', action: 'retry', summary: `startup ${kind}; retry is safe` }
  }
  if (input.toolName?.startsWith('browser_')) {
    const retryable = /crash|wait-timeout|timeout|engine-unavailable/i.test(input.message)
    return {
      failureClass: 'tool_runtime',
      action: retryable ? 'retry' : 'replan',
      summary: retryable ? 'browser failure is retryable; re-observe before retry' : 'browser action needs re-plan',
    }
  }
  if (input.toolName === 'edit_file' || input.toolName === 'write_file' || input.toolName === 'apply_patch') {
    return { failureClass: 'tool_runtime', action: 'replan', summary: 'edit failure needs a fresh read and re-plan' }
  }
  return { failureClass: 'tool_runtime', action: 'reraise', summary: 'failure has no safe automatic recovery' }
}
