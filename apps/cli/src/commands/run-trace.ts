import { readFile } from 'node:fs/promises'
import {
  loadTrajectory,
  readTraceEvents,
  renderTrajectory,
  redactPersistedData,
  exportLearningTrajectory,
  scoreLearningTrajectory,
  type LearningRewardInput,
} from '@orchentra/cli-core'

export async function runTraceCommand(args: {
  traceId: string
  json?: boolean
  events?: boolean
  watch?: boolean
  training?: boolean
  reward?: string
  cwd?: string
  stdout?: (value: string) => void
  stderr?: (value: string) => void
}): Promise<number> {
  const write =
    args.stdout ??
    ((value: string) => {
      process.stdout.write(value)
    })
  const warn =
    args.stderr ??
    ((value: string) => {
      process.stderr.write(value)
    })
  const cwd = args.cwd ?? process.cwd()
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(args.traceId)) {
    warn('trace: invalid trace id\n')
    return 1
  }
  let previous = ''
  try {
    if (args.reward) {
      // The verifier input carries externally graded labels; the reward scorer
      // refuses to invent them, so a missing label stays an unknown component.
      const input = JSON.parse(await readFile(args.reward, 'utf8')) as LearningRewardInput
      const trajectory = await exportLearningTrajectory(cwd, args.traceId)
      write(JSON.stringify(scoreLearningTrajectory(trajectory, input), null, 2) + '\n')
      return 0
    }
    if (args.training) {
      if (args.events || args.watch || args.json) throw new Error('--training cannot combine with other output modes')
      write(JSON.stringify(await exportLearningTrajectory(cwd, args.traceId), null, 2) + '\n')
      return 0
    }
    if (args.events) {
      const events = await readTraceEvents(cwd, args.traceId)
      write(JSON.stringify(redactPersistedData(events), null, 2) + '\n')
      return 0
    }
    do {
      const tree = await loadTrajectory(cwd, args.traceId)
      const text = args.json ? JSON.stringify(redactPersistedData(tree), null, 2) : renderTrajectory(tree)
      if (text !== previous) {
        write(text + '\n')
        previous = text
      }
      if (!args.watch || tree.complete) return 0
      await new Promise<void>((resolve) => setTimeout(resolve, 1000))
    } while (args.watch)
    return 0
  } catch (error) {
    warn(`trace: ${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }
}
