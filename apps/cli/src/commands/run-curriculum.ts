// `orchentra curriculum` — run the short-task RLM curriculum (SG7) through the
// production runtime and report pass rates per split. The curriculum's whole
// point is that its interface is identical to long-task execution, so this
// command drives the same `createCliContext` → `LiveCli.runTurn` path a real
// session uses; only the context objects are seeded. Grading is model-free
// (`gradeLearningCase`), so a pass rate here is task correctness, never a
// judgement about decomposition or evidence quality.

import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import {
  buildLearningCurriculum,
  gradeLearningCase,
  type LearningCase,
  type LearningCurriculum,
  type LearningSplit,
  type DoneReason,
  type ExecutionProfile,
  type UsageTotals,
} from '@orchentra/cli-core'
import { createCliContext } from '../live-cli-factory'
import { CLI_VERSION } from '../version'

export interface CurriculumCaseOutcome {
  id: string
  split: LearningSplit
  domain: LearningCase['domain']
  scale: number
  passed: boolean
  doneReason: DoneReason | 'error'
  /** Truncated raw answer, so a zero score is diagnosable without a re-run. */
  answer: string
  /**
   * Provider/runtime error text for a failed run. Without it an errored case is
   * indistinguishable from a wrong answer — which is exactly how a missing
   * gateway header once read as a whole arm scoring zero.
   */
  error?: string
  /**
   * Token cost and wall time for the case. Once both arms answer everything
   * correctly, correctness stops separating them and this is the only axis the
   * SG7 exit can still be argued on.
   */
  usage?: UsageTotals
  wallMs: number
}

export interface CurriculumRunner {
  (task: LearningCase): Promise<{
    answer: unknown
    doneReason: DoneReason | 'error'
    error?: string
    usage?: UsageTotals
  }>
}

interface SplitTotals {
  passed: number
  total: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  wallMs: number
}

export interface RunCurriculumArgs {
  seed: number
  model: string
  split?: LearningSplit
  /** `rlm` seeds the data as context handles; `direct` inlines it (the control). */
  executionProfile?: ExecutionProfile
  /**
   * Per-turn output cap, identical across arms. A reasoning model spends this
   * budget before it answers, so a cap that fits the rlm arm but not the direct
   * arm measures the cap, not the architecture.
   */
  maxOutputTokens?: number
  out?: string
  list?: boolean
  cwd?: string
  /** Injected runner (tests); defaults to the real in-process harness. */
  runner?: CurriculumRunner
  stdout?: (text: string) => void
  stderr?: (text: string) => void
}

export async function runCurriculumCommand(args: RunCurriculumArgs): Promise<number> {
  const write = args.stdout ?? ((t: string) => process.stdout.write(t))
  const warn = args.stderr ?? ((t: string) => process.stderr.write(t))

  let curriculum: LearningCurriculum
  try {
    curriculum = buildLearningCurriculum(args.seed)
  } catch (error) {
    warn(`curriculum: ${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }
  const cases = args.split ? curriculum.cases.filter((task) => task.split === args.split) : curriculum.cases

  // `--list` prints the generated corpus, expected answers included: it is a
  // local grader artifact, so never paste it into a model request.
  if (args.list) {
    return emit(JSON.stringify({ ...curriculum, cases }, null, 2) + '\n')
  }

  const executionProfile = args.executionProfile ?? 'rlm'
  const runner = args.runner ?? (await liveRunner(args.model, executionProfile, args.maxOutputTokens, args.cwd))
  const results: CurriculumCaseOutcome[] = []
  for (const task of cases) {
    const startedAt = Date.now()
    const outcome = await runner(task).catch((cause: unknown): Awaited<ReturnType<CurriculumRunner>> => ({
      answer: undefined,
      doneReason: 'error' as const,
      error: cause instanceof Error ? cause.message : String(cause),
    }))
    let passed = false
    try {
      passed = gradeLearningCase(task, unfence(outcome.answer))
    } catch (error) {
      warn(`curriculum: ${task.id}: ${error instanceof Error ? error.message : String(error)}\n`)
    }
    results.push({
      id: task.id,
      split: task.split,
      domain: task.domain,
      scale: task.scale,
      passed,
      doneReason: outcome.doneReason,
      answer: String(typeof outcome.answer === 'string' ? outcome.answer : JSON.stringify(outcome.answer)).slice(
        0,
        2000,
      ),
      ...(outcome.error ? { error: outcome.error.slice(0, 2000) } : {}),
      ...(outcome.usage ? { usage: outcome.usage } : {}),
      wallMs: Date.now() - startedAt,
    })
  }

  const bySplit: Record<string, SplitTotals> = {}
  for (const result of results) {
    const bucket = (bySplit[result.split] ??= {
      passed: 0,
      total: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      wallMs: 0,
    })
    bucket.total++
    if (result.passed) bucket.passed++
    bucket.inputTokens += result.usage?.inputTokens ?? 0
    bucket.outputTokens += result.usage?.outputTokens ?? 0
    bucket.cacheReadTokens += result.usage?.cacheReadTokens ?? 0
    bucket.wallMs += result.wallMs
  }

  return emit(
    JSON.stringify(
      {
        schemaVersion: 1,
        generator: curriculum.generator,
        seed: curriculum.seed,
        corpusHash: curriculum.corpusHash,
        interfaceHash: curriculum.interfaceHash,
        model: args.model,
        harness: CLI_VERSION,
        executionProfile,
        maxOutputTokens: args.maxOutputTokens ?? null,
        // Task correctness only. Transfer claims also need the length/domain
        // splits to be measured against the same model's direct-mode control.
        bySplit,
        results,
      },
      null,
      2,
    ) + '\n',
  )

  async function emit(json: string): Promise<number> {
    if (!args.out) {
      write(json)
      return 0
    }
    const outPath = resolve(args.out)
    await mkdir(dirname(outPath), { recursive: true })
    await writeFile(outPath, json, 'utf8')
    warn(`curriculum: written to ${outPath}\n`)
    return 0
  }
}

/**
 * The real runner: one fresh CLI context per case (fresh context store, fresh
 * trace) inside a scratch workspace, so no case can read another's handles and
 * nothing is written into the user's repo. Without configured credentials the
 * provider errors and the case scores as a failed run — honest, never faked.
 */
async function liveRunner(
  model: string,
  executionProfile: ExecutionProfile,
  maxOutputTokens?: number,
  cwd?: string,
): Promise<CurriculumRunner> {
  const workspace = cwd ?? (await mkdtemp(join(tmpdir(), 'orchentra-curriculum-')))
  return async (task: LearningCase) => {
    const context = await createCliContext({
      model,
      permissionMode: 'read-only',
      cwd: workspace,
      executionProfile,
      maxOutputTokens,
    })
    let answer = ''
    let usage: UsageTotals | undefined
    const errors: string[] = []
    context.cli.setEventSink((event) => {
      if (event.kind === 'text') answer += event.delta
      if (event.kind === 'error') errors.push(event.message)
      if (event.kind === 'done') usage = event.usage
    })
    try {
      // `direct` has no context store, so its data has to ride in the prompt —
      // that is the control arm the RLM profile is measured against, not a
      // degraded run with the data silently dropped.
      const turn =
        executionProfile === 'rlm'
          ? await context.cli.runTurn(task.input.userMessage, { contextItems: task.input.contextItems })
          : await context.cli.runTurn(inlinePrompt(task))
      return {
        answer,
        doneReason: turn.reason,
        ...(errors.length ? { error: errors.join('; ') } : {}),
        ...(usage ? { usage } : {}),
      }
    } finally {
      await context.close()
    }
  }
}

/** The direct control sees the identical task with its data inlined verbatim. */
function inlinePrompt(task: LearningCase): string {
  const blocks = task.input.contextItems.map(
    (item, index) => `<data id="${index}" summary="${item.summary ?? ''}">\n${item.value.text ?? ''}\n</data>`,
  )
  return [task.input.userMessage, ...blocks].join('\n\n')
}

/**
 * A run's text is the whole streamed turn — commentary and then the answer — so
 * the JSON array has to be lifted out of it. Prefer a fenced block, else take
 * the last bracketed array in the text. The grader itself stays strict: this
 * only decides which substring is offered as the answer.
 */
function unfence(answer: unknown): unknown {
  if (typeof answer !== 'string') return answer
  const fenced = /```(?:json)?\s*([\s\S]*?)```/g
  let candidate: string | undefined
  for (let match = fenced.exec(answer); match !== null; match = fenced.exec(answer)) candidate = match[1]
  if (candidate?.trim().startsWith('[')) return candidate.trim()
  const arrays = answer.match(/\[[^[\]]*\]/g)
  return arrays?.length ? arrays[arrays.length - 1]! : answer.trim()
}
