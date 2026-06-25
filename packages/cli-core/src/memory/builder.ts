import type { FailureType, PatternBuilderInput } from './types'

export function buildPatternText(input: PatternBuilderInput): string {
  const lines: string[] = [`workflow: ${input.workflowName}`]
  if (input.jobName) lines.push(`job: ${input.jobName}`)
  if (input.stepName) lines.push(`step: ${input.stepName}`)
  lines.push(`branch: ${input.branch}`, `root_cause: ${input.rootCause}`)
  if (input.summary) lines.push(`summary: ${input.summary}`)
  if (input.failureType) lines.push(`failure_type: ${input.failureType}`)
  if (input.signatureHash) lines.push(`signature: ${input.signatureHash}`)
  return lines.join('\n')
}

export function buildResolutionText(suggestedFix: string | undefined): string {
  return suggestedFix ?? 'No resolution recorded'
}

export const FAILURE_TYPES: FailureType[] = [
  'flaky_test',
  'env_missing',
  'dependency_conflict',
  'infra_timeout',
  'code_bug',
  'unknown',
]
