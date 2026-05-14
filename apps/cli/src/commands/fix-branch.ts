import { createHash } from 'node:crypto'

export interface FixBranchInputs {
  readonly runId: number
  readonly base?: string
}

export function fixBranchName(inputs: FixBranchInputs): string {
  return `orchentra/fix/run-${inputs.runId}`
}

export function defaultFixTitle(runName: string | null, runId: number): string {
  const prefix = runName ? `${runName.trim()} ` : ''
  return `fix(ci): ${prefix}restore run #${runId}`.slice(0, 120)
}

export function idempotencyKey(head: string, base: string, title: string): string {
  return createHash('sha256').update(`${head}\x00${base}\x00${title}`).digest('hex').slice(0, 16)
}

export function renderFixBody(args: {
  readonly runUrl: string
  readonly runId: number
  readonly idempotencyKey: string
  readonly bug: string
  readonly fix: string
  readonly reasoning: string
}): string {
  return [
    `**Bug.** ${oneLine(args.bug)}`,
    '',
    `**Fix.** ${oneLine(args.fix)} See [run #${args.runId}](${args.runUrl}).`,
    '',
    `**Reasoning.** ${oneLine(args.reasoning)}`,
    '',
    `<!-- orchentra:fix-pr key=${args.idempotencyKey} -->`,
  ].join('\n')
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}
