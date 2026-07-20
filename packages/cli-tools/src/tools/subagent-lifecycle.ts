import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  ChatMessage,
  ConversationRuntime,
  DoneReason,
  RunState,
  ToolContext,
  ToolDefinition,
  ToolResult,
  UsageTotals,
} from '@orchentra/cli-core'
import { resolveSubagentRole, restrictRegistry, type SubagentRole } from './subagent-roles'
import { runSubagent, type SubagentRunOutcome } from './subagent-run'

/**
 * Child lifecycle (M6): background sub-agents with durable, resumable
 * transcripts. Every child persists a JSON transcript snapshot — messages
 * plus the same RunState checkpoint the top-level resume machinery uses — so
 * a child can be steered mid-run, awaited, or resumed after an interruption
 * (including across processes: a transcript found on disk in "running" state
 * means the process died mid-run and the child is treated as suspended).
 */

export type ChildStatus = 'running' | 'completed' | 'failed' | 'suspended'

export interface ChildTranscript {
  version: 1
  id: string
  prompt: string
  model: string
  role: string
  status: ChildStatus
  messages: ChatMessage[]
  runState?: RunState
  doneReason?: DoneReason
  resultText?: string
  usage?: UsageTotals
  costUsd?: number
  updatedAt: string
}

interface ChildHandle {
  id: string
  cwd: string
  prompt: string
  model: string
  roleName: string
  status: ChildStatus
  runtime: ConversationRuntime | null
  promise: Promise<SubagentRunOutcome> | null
  outcome: SubagentRunOutcome | null
  lastRunState: RunState | null
  /** Messages restored from a transcript when the live runtime is gone. */
  restoredMessages: ChatMessage[]
  /** Serializes snapshot writes so a slow write never lands out of order. */
  persistChain: Promise<void>
  /** Cancels the current run when interrupted; replaced on each (re)attach. */
  abortController: AbortController | null
  /** ISO timestamp of the most recent spawn/resume. */
  startedAt: string
}

const children = new Map<string, ChildHandle>()

/** Test isolation only; production never resets the per-process registry. */
export function resetChildRegistryForTests(): void {
  children.clear()
}

function transcriptPath(cwd: string, id: string): string {
  return join(cwd, '.orchentra', 'subagents', `${id}.json`)
}

function snapshot(handle: ChildHandle): ChildTranscript {
  return {
    version: 1,
    id: handle.id,
    prompt: handle.prompt,
    model: handle.model,
    role: handle.roleName,
    status: handle.status,
    messages: handle.runtime?.getFinalMessages() ?? handle.restoredMessages,
    runState: handle.lastRunState ?? undefined,
    doneReason: handle.outcome?.doneReason,
    resultText: handle.outcome?.text,
    usage: handle.outcome?.usage,
    costUsd: handle.outcome?.costUsd,
    updatedAt: new Date().toISOString(),
  }
}

function persist(handle: ChildHandle): void {
  const record = snapshot(handle)
  handle.persistChain = handle.persistChain
    .then(async () => {
      const path = transcriptPath(handle.cwd, handle.id)
      await mkdir(join(handle.cwd, '.orchentra', 'subagents'), { recursive: true })
      await writeFile(`${path}.tmp`, JSON.stringify(record, null, 2))
      await rename(`${path}.tmp`, path)
    })
    .catch(() => {
      // Transcript persistence must never take the child down with it.
    })
}

function attachRun(handle: ChildHandle, ctx: ToolContext, role: SubagentRole, prompt: string, resume: boolean): void {
  handle.status = 'running'
  handle.outcome = null
  handle.startedAt = new Date().toISOString()
  const abortController = new AbortController()
  handle.abortController = abortController
  handle.promise = runSubagent(prompt, handle.model, ctx, role, {
    ...(resume
      ? { priorMessages: handle.restoredMessages, runState: handle.lastRunState ?? undefined, resume: true }
      : {}),
    signal: abortController.signal,
    onRuntime: (runtime) => {
      handle.runtime = runtime
    },
    onEvent: (event) => {
      if (event.kind === 'run_state') handle.lastRunState = event.state
      // Durable checkpoints at the boundaries that change the transcript:
      // state transitions, completed tool calls, and injected steering.
      if (event.kind === 'run_state' || event.kind === 'tool_result' || event.kind === 'user_message') {
        persist(handle)
      }
    },
  }).then((outcome) => {
    handle.outcome = outcome
    handle.restoredMessages = handle.runtime?.getFinalMessages() ?? handle.restoredMessages
    handle.runtime = null
    handle.status = outcome.doneReason === 'aborted' ? 'suspended' : outcome.isError ? 'failed' : 'completed'
    persist(handle)
    return outcome
  })
  persist(handle)
}

export function spawnBackgroundChild(
  prompt: string,
  ctxModel: string,
  ctx: ToolContext,
  role: SubagentRole,
): { id: string } {
  const handle: ChildHandle = {
    id: randomUUID(),
    cwd: ctx.cwd,
    prompt,
    model: ctxModel,
    roleName: role.name,
    status: 'running',
    runtime: null,
    promise: null,
    outcome: null,
    lastRunState: null,
    restoredMessages: [],
    persistChain: Promise.resolve(),
    abortController: null,
    startedAt: new Date().toISOString(),
  }
  children.set(handle.id, handle)
  attachRun(handle, ctx, role, prompt, false)
  return { id: handle.id }
}

async function loadFromDisk(cwd: string, id: string): Promise<ChildHandle | null> {
  let raw: string
  try {
    raw = await readFile(transcriptPath(cwd, id), 'utf8')
  } catch {
    return null
  }
  const record = JSON.parse(raw) as ChildTranscript
  const handle: ChildHandle = {
    id: record.id,
    cwd,
    prompt: record.prompt,
    model: record.model,
    roleName: record.role,
    // A transcript still marked running belongs to a dead process: the child
    // was interrupted mid-run and is resumable, not alive.
    status: record.status === 'running' ? 'suspended' : record.status,
    runtime: null,
    promise: null,
    outcome: null,
    lastRunState: record.runState ?? null,
    restoredMessages: record.messages ?? [],
    persistChain: Promise.resolve(),
    abortController: null,
    startedAt: record.updatedAt,
  }
  children.set(id, handle)
  return handle
}

async function getChild(cwd: string, id: string): Promise<ChildHandle | null> {
  return children.get(id) ?? (await loadFromDisk(cwd, id))
}

function statusLine(handle: ChildHandle): string {
  const cost = handle.outcome ? ` cost $${handle.outcome.costUsd.toFixed(4)}` : ''
  return `${handle.id}: ${handle.status} (${handle.roleName})${cost}`
}

interface AgentControlInput {
  action?: string
  agentId?: string
  instruction?: string
}

export const agentControlTool: ToolDefinition = {
  name: 'agent_control',
  description:
    'Manage background sub-agents spawned with the agent tool: "steer" injects an instruction into a running agent at its next step, "interrupt" cancels a running agent cleanly (it stops at the next boundary and can be resumed), "wait" blocks until it finishes and returns its result, "resume" restarts a suspended/finished agent from its persisted transcript (optionally with a new instruction), "status" reports one or all agents.',
  level: 'admin',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['steer', 'interrupt', 'wait', 'resume', 'status'] },
      agentId: { type: 'string', description: 'Agent id returned by a background spawn (required except for status)' },
      instruction: {
        type: 'string',
        description: 'Steering or resume instruction (required for steer, optional for resume)',
      },
    },
    required: ['action'],
    additionalProperties: false,
  },
  async execute(args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const input = args as AgentControlInput

    if (input.action === 'status') {
      if (!input.agentId) {
        const lines = Array.from(children.values()).map(statusLine)
        return { content: lines.length > 0 ? lines.join('\n') : 'no background agents', isError: false }
      }
      const handle = await getChild(ctx.cwd, input.agentId)
      if (!handle) return unknownAgent(input.agentId)
      return {
        content: statusLine(handle),
        isError: false,
        data: {
          id: handle.id,
          status: handle.status,
          role: handle.roleName,
          startedAt: handle.startedAt,
          doneReason: handle.outcome?.doneReason,
          usage: handle.outcome?.usage,
          costUsd: handle.outcome?.costUsd,
        },
      }
    }

    if (!input.agentId) {
      return { content: `error: "${input.action}" requires an agentId`, isError: true }
    }
    const handle = await getChild(ctx.cwd, input.agentId)
    if (!handle) return unknownAgent(input.agentId)

    switch (input.action) {
      case 'steer': {
        if (!input.instruction?.trim()) {
          return { content: 'error: steer requires an instruction', isError: true }
        }
        if (handle.status !== 'running' || !handle.runtime) {
          return {
            content: `error: agent ${handle.id} is ${handle.status}; only a running agent can be steered (use resume)`,
            isError: true,
          }
        }
        handle.runtime.steer(input.instruction)
        return { content: `steering queued for agent ${handle.id}; it lands at the next step boundary`, isError: false }
      }
      case 'interrupt': {
        if (handle.status !== 'running' || !handle.abortController) {
          return {
            content: `error: agent ${handle.id} is ${handle.status}, not running; nothing to interrupt`,
            isError: true,
          }
        }
        handle.abortController.abort()
        // Let the run settle to its clean aborted checkpoint before reporting,
        // so status/transcript reflect the stop rather than a race.
        if (handle.promise) await handle.promise
        return {
          content: `agent ${handle.id} interrupted; it stopped cleanly and can be resumed`,
          isError: false,
          data: { id: handle.id, status: handle.status },
        }
      }
      case 'wait': {
        if (handle.status === 'running' && handle.promise) {
          const outcome = await handle.promise
          return waitResult(handle, outcome)
        }
        if (handle.outcome) return waitResult(handle, handle.outcome)
        return {
          content: `agent ${handle.id} is ${handle.status} with no in-process run to wait on (use resume)`,
          isError: true,
        }
      }
      case 'resume': {
        if (handle.status === 'running') {
          return { content: `error: agent ${handle.id} is already running (use steer or wait)`, isError: true }
        }
        if (!ctx.provider || !ctx.tools) {
          return { content: 'error: provider and tools not available to resume the agent', isError: true }
        }
        const { role } = resolveSubagentRole(handle.roleName === 'generic' ? undefined : handle.roleName)
        if (!role) {
          return { content: `error: transcript role "${handle.roleName}" is no longer resolvable`, isError: true }
        }
        const continuation =
          input.instruction?.trim() || 'Continue the delegated task from this checkpoint; do not repeat completed work.'
        // Same capability cap the child ran under at spawn: a role-capped
        // transcript must not resume with the parent's full registry.
        const resumeCtx: ToolContext = {
          ...ctx,
          subagentDepth: (ctx.subagentDepth ?? 0) + 1,
          tools: restrictRegistry(ctx.tools, role),
        }
        attachRun(handle, resumeCtx, role, continuation, true)
        return {
          content: `agent ${handle.id} resumed in the background; use wait to collect its result`,
          isError: false,
          data: { id: handle.id, status: handle.status },
        }
      }
      default:
        return { content: `error: unknown action "${input.action}"`, isError: true }
    }
  },
}

function unknownAgent(id: string): ToolResult {
  return { content: `error: no background agent "${id}" in this run or on disk`, isError: true }
}

function waitResult(handle: ChildHandle, outcome: SubagentRunOutcome): ToolResult {
  return {
    content: outcome.text,
    isError: outcome.isError,
    data: {
      id: handle.id,
      status: handle.status,
      doneReason: outcome.doneReason,
      toolCalls: outcome.toolCalls,
      usage: outcome.usage,
      costUsd: outcome.costUsd,
      traceId: outcome.traceId,
    },
  }
}
