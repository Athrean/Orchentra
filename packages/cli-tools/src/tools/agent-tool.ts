import {
  type ToolDefinition,
  type ToolResult,
  type ToolContext,
  type DoneReason,
  type Provider,
  ConversationRuntime,
  buildSystemPrompt,
} from '@orchentra/cli-core'
import { isRateLimitError } from '@orchentra/cli-api'
import { runSubagentPool } from './subagent-pool'
import { resolveSubagentRole, restrictRegistry, type SubagentRole } from './subagent-roles'

interface AgentInput {
  prompt?: string
  tasks?: string[]
  model?: string
  description?: string
  justification?: string
  agentType?: string
}

const MAX_ITERATIONS_PER_SUBAGENT = 10
const SUBAGENT_MAX_OUTPUT_TOKENS = 4096
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
  description: `Spawn sub-agent(s) to perform a task. Each sub-agent runs a nested conversation loop with the same tools and spine, and its spend counts against the parent budget. Pass "tasks" (an array of independent task prompts) to fan out concurrent sub-agents instead of running one at a time, capped at ${MAX_CONCURRENT_SUBAGENTS} running at once. Beyond ${SPAWN_JUSTIFICATION_THRESHOLD} tasks, pass "justification" explaining why parallel fan-out is warranted.`,
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
      tasks: results.map((r) => ({
        doneReason: r.doneReason,
        toolCalls: r.toolCalls,
        isError: r.isError,
        traceId: r.traceId,
      })),
    }

    if (results.length === 1) {
      return { content: results[0].text, isError: results[0].isError, data, evidence }
    }

    return {
      content: results.map((r, i) => `[task ${i + 1}] ${r.text}`).join('\n\n'),
      isError: results.some((r) => r.isError),
      data,
      evidence,
    }
  },
}

function resolveTasks(input: AgentInput): string[] {
  const fromTasks = Array.isArray(input?.tasks)
    ? input.tasks.filter((t): t is string => typeof t === 'string' && t.length > 0)
    : []
  if (fromTasks.length > 0) return fromTasks
  return input?.prompt ? [input.prompt] : []
}

interface SubagentRunOutcome {
  text: string
  isError: boolean
  rateLimited?: boolean
  doneReason?: DoneReason
  toolCalls?: number
  /** Trace id of the child run, linking its trace dir from the parent manifest. */
  traceId?: string
}

async function runSubagent(
  prompt: string,
  model: string,
  ctx: ToolContext,
  role: SubagentRole,
): Promise<SubagentRunOutcome> {
  // The runtime reports stream failures as message strings, so wrap the
  // provider to keep the thrown error's type for rate-limit classification.
  let thrown: unknown
  const provider: Provider = {
    stream(request) {
      const source = ctx.provider!
      return (async function* () {
        try {
          yield* source.stream(request)
        } catch (err) {
          thrown = err
          throw err
        }
      })()
    },
  }

  try {
    const abort = new AbortController()
    const runtime = new ConversationRuntime(
      {
        model,
        maxOutputTokens: SUBAGENT_MAX_OUTPUT_TOKENS,
        contextWindowTokens: 200_000,
        compactionThreshold: 0.8,
        keepRecentOnCompact: 6,
        budget: { maxSteps: MAX_ITERATIONS_PER_SUBAGENT, maxTokens: 200_000, model },
        sessionId: ctx.sessionId,
        cwd: ctx.cwd,
        providerName: ctx.providerName,
        harnessVersion: ctx.harnessVersion,
      },
      {
        provider,
        tools: ctx.tools!,
        systemPrompt: buildSystemPrompt({
          staticParts: [
            role.focus,
            ctx.spinePrompt ?? '',
            'Complete the delegated scope only. Do not push or perform destructive git operations.',
          ],
          dynamicParts: [],
        }),
        sharedState: ctx.sharedState,
        askUser: ctx.askUser,
        permissionMode: ctx.permissionMode,
        spinePrompt: ctx.spinePrompt,
        workspaceRoots: ctx.workspaceRoots,
        subagentDepth: ctx.subagentDepth,
        quirks: ctx.quirks,
        // Only when the host injected one (tests route sub-agents to a no-op
        // sink). Unset in production so each sub-agent builds its own on-disk
        // trace dir and lastTraceId links back into the parent manifest.
        ...(ctx.traceSink ? { traceSink: ctx.traceSink } : {}),
        signal: abort.signal,
      },
    )

    let buf = ''
    let resultText = ''
    let toolCallsDone = 0
    let doneReason: DoneReason = 'stop'
    let errorMessage = ''

    for await (const ev of runtime.run({ userMessage: prompt })) {
      if (ev.kind === 'text') {
        buf += ev.delta
      } else if (ev.kind === 'tool_result') {
        toolCallsDone++
        buf = ''
      } else if (ev.kind === 'usage') {
        // Children draw the parent's live budget: spend lands as it happens,
        // and an exhausted parent aborts the child mid-run. Skip the abort
        // when the turn already failed — aborting here would relabel a
        // provider error (e.g. a 429 the pool wants to classify) as 'aborted'.
        ctx.budget?.addUsage(ev.turn)
        if (!errorMessage && ctx.budget?.snapshot().exhausted) abort.abort()
      } else if (ev.kind === 'error') {
        errorMessage = ev.message
      } else if (ev.kind === 'done') {
        doneReason = ev.reason
      }
    }
    if (buf) resultText = buf
    const traceId = runtime.lastTraceId ?? undefined

    if (doneReason === 'error') {
      return {
        text: `agent error: ${errorMessage || 'provider stream failed'}`,
        isError: true,
        rateLimited: isRateLimitError(thrown),
        doneReason,
        toolCalls: toolCallsDone,
        traceId,
      }
    }
    if (doneReason === 'loop_detected') {
      return {
        text: resultText || `Sub-agent stopped: repeated tool-call loop detected after ${toolCallsDone} tool call(s).`,
        isError: true,
        doneReason,
        toolCalls: toolCallsDone,
        traceId,
      }
    }
    if (doneReason === 'aborted') {
      return {
        text: resultText || `Sub-agent stopped: parent budget exhausted after ${toolCallsDone} tool call(s).`,
        isError: false,
        doneReason,
        toolCalls: toolCallsDone,
        traceId,
      }
    }
    return {
      text: resultText || `Sub-agent completed (${toolCallsDone} tool call(s)).`,
      isError: false,
      doneReason,
      toolCalls: toolCallsDone,
      traceId,
    }
  } catch (e) {
    return {
      text: `agent error: ${(e as Error).message}`,
      isError: true,
      rateLimited: isRateLimitError(e),
      doneReason: 'error',
      toolCalls: 0,
    }
  }
}
