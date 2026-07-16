import {
  type ToolDefinition,
  type ToolResult,
  type ToolContext,
  type DoneReason,
  type GateDecisionRecord,
  type UsageTotals,
  CompletionPolicy,
  addUsage,
  emptyUsage,
} from '@orchentra/cli-core'
import { runSubagentPool } from './subagent-pool'
import { resolveSubagentRole, restrictRegistry, type SubagentRole } from './subagent-roles'
import { runSubagent, type SubagentRunOutcome } from './subagent-run'
import { spawnBackgroundChild } from './subagent-lifecycle'
import {
  addWorktree,
  applySliceDiff,
  findOverlaps,
  removeWorktree,
  resolveRepoRoot,
  sliceDiff,
  sliceFiles,
  type WorktreeSlice,
} from './worktree-writers'

interface AgentInput {
  prompt?: string
  tasks?: string[]
  model?: string
  description?: string
  justification?: string
  agentType?: string
  isolation?: string
  background?: boolean
}

// A sub-agent may itself delegate to `agent`, but only so deep. The root runs
// at depth 0; its sub-agents at 1; theirs at 2. A context already at this depth
// refuses to spawn, capping the nesting tree at two levels below the root.
// Budget inheritance bounds total spend; this bounds fan-out/nesting shape.
const MAX_SUBAGENT_DEPTH = 2
// Caps simultaneous provider streams from one `tasks` fan-out so a large
// batch can't fire dozens of concurrent requests at once (rate-limit/cost
// blast radius). Independent of the recursion depth cap above.
const MAX_CONCURRENT_SUBAGENTS = 4
// Beyond this many tasks, the caller must say why fan-out is warranted —
// makes cost accountable instead of letting a model silently spray N tasks.
const SPAWN_JUSTIFICATION_THRESHOLD = 4

export const agentTool: ToolDefinition = {
  name: 'agent',
  description: `Spawn sub-agent(s) to perform a task. Each sub-agent runs a nested conversation loop with the same tools and spine, and its spend counts against the parent budget. Pass "tasks" (an array of independent task prompts) to fan out concurrent sub-agents instead of running one at a time, capped at ${MAX_CONCURRENT_SUBAGENTS} running at once. Beyond ${SPAWN_JUSTIFICATION_THRESHOLD} tasks, pass "justification" explaining why parallel fan-out is warranted. When parallel tasks write code, pass isolation "worktree" so each slice runs in its own git worktree and only gated, non-overlapping slices merge back.`,
  level: 'admin',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'The task for a single sub-agent' },
      tasks: {
        type: 'array',
        items: { type: 'string' },
        description: 'Independent task prompts to run as concurrent sub-agents instead of "prompt"',
      },
      model: { type: 'string', description: 'Optional model override for the sub-agent(s)' },
      description: { type: 'string', description: 'Short description of what the agent will do' },
      justification: {
        type: 'string',
        description: `Required when "tasks" has more than ${SPAWN_JUSTIFICATION_THRESHOLD} entries: why parallel fan-out is warranted here`,
      },
      agentType: {
        type: 'string',
        enum: ['explorer', 'reviewer', 'builder'],
        description:
          'Optional specialist role for the sub-agent(s): "explorer" searches/reads only (no writes), "reviewer" verifies by running checks (read + command execution, no edits), "builder" implements with the full toolset. Omit for a generic sub-agent. Applies to every task in a "tasks" batch.',
      },
      isolation: {
        type: 'string',
        enum: ['worktree'],
        description:
          'Pass "worktree" when parallel tasks write code: each task runs in its own git worktree at HEAD, is gated on verification evidence, and only disjoint gated slices merge back into the parent tree. Requires a git repository.',
      },
      background: {
        type: 'boolean',
        description:
          'Spawn the sub-agent(s) in the background and return their agent ids immediately instead of blocking. Manage them with the agent_control tool (steer/wait/resume/status). Not combinable with isolation.',
      },
    },
    additionalProperties: false,
  },
  async execute(args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const input = args as AgentInput
    const tasks = resolveTasks(input)
    if (tasks.length === 0) {
      return { content: 'error: pass "prompt" or a non-empty "tasks" array', isError: true }
    }
    if (tasks.length > SPAWN_JUSTIFICATION_THRESHOLD && !input.justification?.trim()) {
      return {
        content: `error: fanning out ${tasks.length} tasks needs a one-line "justification" (why parallel, why not fewer) once over ${SPAWN_JUSTIFICATION_THRESHOLD}`,
        isError: true,
      }
    }
    if (!ctx.provider || !ctx.tools) {
      return { content: 'error: provider and tools not available for sub-agent', isError: true }
    }

    const { role, error: roleError } = resolveSubagentRole(input.agentType)
    if (!role) {
      return { content: `error: ${roleError}`, isError: true }
    }

    const model = input.model ?? ctx.model
    if (!model) {
      return {
        content: 'error: no model available for sub-agent (pass "model" or ensure ToolContext carries one)',
        isError: true,
      }
    }

    if (ctx.budget?.snapshot().exhausted) {
      return { content: 'error: parent budget already exhausted, refusing to spawn sub-agent', isError: true }
    }

    const depth = ctx.subagentDepth ?? 0
    if (depth >= MAX_SUBAGENT_DEPTH) {
      return {
        content: `error: sub-agent recursion depth cap reached (${MAX_SUBAGENT_DEPTH}); refusing to spawn deeper`,
        isError: true,
      }
    }

    // Children run their own tool calls one level deeper so a nested `agent`
    // call sees the incremented depth and the cap holds down the tree. A
    // role-capped child gets a narrowed registry on both the advertised and
    // execute surfaces.
    const childCtx: ToolContext = { ...ctx, subagentDepth: depth + 1, tools: restrictRegistry(ctx.tools, role) }

    if (input.background) {
      if (input.isolation !== undefined) {
        return { content: 'error: background and isolation cannot be combined', isError: true }
      }
      const ids = tasks.map((task) => spawnBackgroundChild(task, model, childCtx, role).id)
      return {
        content:
          `Spawned ${ids.length} background agent(s): ${ids.join(', ')}. ` +
          'Use agent_control (steer/wait/resume/status) to manage them.',
        isError: false,
        data: { agentIds: ids },
      }
    }

    if (input.isolation === 'worktree') {
      return runWorktreeBatch(tasks, model, childCtx, role)
    }
    if (input.isolation !== undefined) {
      return { content: `error: unknown isolation "${input.isolation}"; only "worktree" is supported`, isError: true }
    }

    const pooled = await runSubagentPool(tasks, {
      limit: MAX_CONCURRENT_SUBAGENTS,
      run: (task) => runSubagent(task, model, childCtx, role),
      // Requeue only rate-limited tasks, and never once the parent budget is
      // spent — a retry re-runs the task from scratch and costs real dollars.
      shouldRequeue: (r) => r.rateLimited === true && !ctx.budget?.snapshot().exhausted,
    })
    const results = pooled.map(({ value, requeues }) =>
      value.rateLimited && requeues > 0
        ? { ...value, text: `${value.text} [rate-limited; gave up after ${requeues} requeue(s)]` }
        : value,
    )

    const evidence = results.map((r, i) => ({
      kind: 'subagent',
      summary: `task ${i + 1}: ${r.doneReason ?? 'stop'} after ${r.toolCalls ?? 0} tool call(s)${r.isError ? ' (error)' : ''}`,
      // traceId links the child's own trace dir; the parent runtime lifts it
      // into the manifest's subAgentTraceIds.
      detail: {
        doneReason: r.doneReason,
        toolCalls: r.toolCalls,
        isError: r.isError,
        role: role.name,
        traceId: r.traceId,
      },
    }))
    const data = {
      tasks: taskSummaries(results),
      fanout: fanoutSummary(results),
    }

    if (results.length === 1) {
      return { content: results[0].text, isError: results[0].isError, data, evidence }
    }

    const summary = data.fanout
    return {
      content:
        results.map((r, i) => `[task ${i + 1}] ${r.text}`).join('\n\n') +
        `\n\n[fan-out] ${summary.succeeded}/${summary.tasks} succeeded; est. cost $${summary.costUsd.toFixed(4)}`,
      isError: results.some((r) => r.isError),
      data,
      evidence,
    }
  },
}

/**
 * Fan-out aggregation (M6): partial failures are per-task classified results,
 * never a parent crash, and every batch accounts its own token/dollar spend.
 */
function fanoutSummary(results: SubagentRunOutcome[]): {
  tasks: number
  succeeded: number
  failed: number
  usage: UsageTotals
  costUsd: number
} {
  let usage = emptyUsage()
  let costUsd = 0
  for (const r of results) {
    usage = addUsage(usage, r.usage)
    costUsd += r.costUsd
  }
  const failed = results.filter((r) => r.isError).length
  return { tasks: results.length, succeeded: results.length - failed, failed, usage, costUsd }
}

/**
 * M6 phase-1: parallel write-capable children run in isolated git worktrees
 * at the parent's HEAD, so concurrent slices never edit a shared tree. Every
 * child is gated through the CompletionPolicy before its slice is considered
 * mergeable, and overlapping file ownership fails the whole batch loudly
 * instead of silently racing.
 */
async function runWorktreeBatch(
  tasks: string[],
  model: string,
  childCtx: ToolContext,
  role: SubagentRole,
): Promise<ToolResult> {
  const repoRoot = await resolveRepoRoot(childCtx.cwd)
  if (!repoRoot) {
    return { content: 'error: isolation "worktree" requires running inside a git repository', isError: true }
  }
  // Same default evidence bar as the top-level completion gate. k=1 with the
  // deterministic replay: per-slice reviewer replay would multiply model
  // spend by every parallel child; the host's own gate still replays the
  // integrated result.
  const policy = new CompletionPolicy({
    obligations: [
      {
        id: 'executable-verification',
        description: 'run a relevant command and collect its exit status',
        evidenceKinds: ['exit-status'],
      },
    ],
    k: 1,
    maxRetries: 2,
  })

  const slices: WorktreeSlice[] = []
  try {
    // Sequential adds: git serializes worktree bookkeeping per repo.
    for (let i = 0; i < tasks.length; i++) slices.push(await addWorktree(repoRoot))

    // Pool over index keys, not prompts: duplicate prompts must still map to
    // distinct worktrees.
    const pooled = await runSubagentPool(
      tasks.map((_, index) => String(index)),
      {
        limit: MAX_CONCURRENT_SUBAGENTS,
        run: (key) => {
          const slice = slices[Number(key)]!
          const sliceCtx: ToolContext = { ...childCtx, cwd: slice.dir, workspaceRoots: [slice.dir] }
          return runSubagent(tasks[Number(key)]!, model, sliceCtx, role, { completionPolicy: policy })
        },
        shouldRequeue: (r) => r.rateLimited === true && !childCtx.budget?.snapshot().exhausted,
      },
    )
    const results = pooled.map((p) => p.value)
    const files = await Promise.all(slices.map((slice) => sliceFiles(slice.dir)))

    const overlaps = findOverlaps(files)
    if (overlaps.length > 0) {
      const detail = overlaps
        .map((o) => `tasks ${o.tasks[0]} and ${o.tasks[1]} both touched: ${o.files.join(', ')}`)
        .join('; ')
      return {
        content: `error: overlapping slice ownership — ${detail}. Nothing merged; split the tasks so each file has exactly one owner.`,
        isError: true,
        data: {
          tasks: taskSummaries(results),
          slices: sliceSummaries(results, files, new Array(files.length).fill(false)),
        },
      }
    }

    const merged: boolean[] = []
    for (let i = 0; i < results.length; i++) {
      const gatedPass = results[i]!.doneReason === 'stop' && !results[i]!.isError
      if (!gatedPass || files[i]!.length === 0) {
        merged.push(false)
        continue
      }
      await applySliceDiff(repoRoot, await sliceDiff(slices[i]!.dir))
      merged.push(true)
    }

    const lines = results.map((r, i) => {
      const status = merged[i]
        ? `merged ${files[i]!.length} file(s): ${files[i]!.join(', ')}`
        : r.isError
          ? `not merged (${r.doneReason ?? 'error'})`
          : 'no file changes'
      return `[task ${i + 1}] ${r.text}\n[slice ${i + 1}] gate: ${r.gate?.outcome ?? 'not-run'}; ${status}`
    })
    const evidence = results.map((r, i) => ({
      kind: 'subagent',
      summary: `slice ${i + 1}: ${r.doneReason ?? 'stop'}, gate ${r.gate?.outcome ?? 'not-run'}, ${merged[i] ? 'merged' : 'not merged'}`,
      detail: {
        doneReason: r.doneReason,
        toolCalls: r.toolCalls,
        isError: r.isError,
        role: role.name,
        traceId: r.traceId,
        files: files[i],
        merged: merged[i],
      },
    }))
    return {
      content: lines.join('\n\n'),
      isError: results.some((r) => r.isError),
      data: {
        tasks: taskSummaries(results),
        slices: sliceSummaries(results, files, merged),
        fanout: fanoutSummary(results),
      },
      evidence,
    }
  } catch (e) {
    return { content: `worktree batch error: ${(e as Error).message}`, isError: true }
  } finally {
    await Promise.all(slices.map((slice) => removeWorktree(repoRoot, slice.dir).catch(() => {})))
  }
}

interface TaskSummary {
  doneReason?: DoneReason
  toolCalls?: number
  isError: boolean
  traceId?: string
}

interface SliceSummary {
  files?: string[]
  gate: GateDecisionRecord | null
  merged: boolean
}

function taskSummaries(results: SubagentRunOutcome[]): TaskSummary[] {
  return results.map((r) => ({
    doneReason: r.doneReason,
    toolCalls: r.toolCalls,
    isError: r.isError,
    traceId: r.traceId,
  }))
}

function sliceSummaries(results: SubagentRunOutcome[], files: string[][], merged: boolean[]): SliceSummary[] {
  return results.map((r, i) => ({ files: files[i], gate: r.gate ?? null, merged: merged[i] ?? false }))
}

function resolveTasks(input: AgentInput): string[] {
  const fromTasks = Array.isArray(input?.tasks)
    ? input.tasks.filter((t): t is string => typeof t === 'string' && t.length > 0)
    : []
  if (fromTasks.length > 0) return fromTasks
  return input?.prompt ? [input.prompt] : []
}
