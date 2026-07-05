import {
  type ToolDefinition,
  type ToolResult,
  type ToolContext,
  type ChatMessage,
  type ProviderRequest,
  type ProviderStreamEvent,
  type UsageTotals,
  emptyUsage,
  addUsage,
} from '@orchentra/cli-core'
import { isRateLimitError } from '@orchentra/cli-api'
import { runSubagentPool } from './subagent-pool'

interface AgentInput {
  prompt?: string
  tasks?: string[]
  model?: string
  description?: string
  justification?: string
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
    // call sees the incremented depth and the cap holds down the tree.
    const childCtx: ToolContext = { ...ctx, subagentDepth: depth + 1 }
    const pooled = await runSubagentPool(tasks, {
      limit: MAX_CONCURRENT_SUBAGENTS,
      run: (task) => runSubagent(task, model, childCtx),
      // Requeue only rate-limited tasks, and never once the parent budget is
      // spent — a retry re-runs the task from scratch and costs real dollars.
      shouldRequeue: (r) => r.rateLimited === true && !ctx.budget?.snapshot().exhausted,
    })
    const results = pooled.map(({ value, requeues }) =>
      value.rateLimited && requeues > 0
        ? { ...value, text: `${value.text} [rate-limited; gave up after ${requeues} requeue(s)]` }
        : value,
    )

    if (results.length === 1) {
      return { content: results[0].text, isError: results[0].isError }
    }

    return {
      content: results.map((r, i) => `[task ${i + 1}] ${r.text}`).join('\n\n'),
      isError: results.some((r) => r.isError),
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

async function runSubagent(
  prompt: string,
  model: string,
  ctx: ToolContext,
): Promise<{ text: string; isError: boolean; rateLimited?: boolean }> {
  try {
    const messages: ChatMessage[] = [{ role: 'user', content: prompt }]
    const toolSchemas = ctx.tools!.list()

    const request: ProviderRequest = {
      systemStatic: [
        'You are a helpful coding assistant completing a specific sub-task.',
        ctx.spinePrompt,
        'Complete the delegated scope only. Do not push or perform destructive git operations.',
      ]
        .filter(Boolean)
        .join('\n\n'),
      systemDynamic: '',
      messages,
      tools: toolSchemas,
      model,
      maxOutputTokens: SUBAGENT_MAX_OUTPUT_TOKENS,
    }

    let resultText = ''
    let toolCallsDone = 0

    for (let i = 0; i < MAX_ITERATIONS_PER_SUBAGENT; i++) {
      if (ctx.budget?.snapshot().exhausted) {
        return {
          text: resultText || `Sub-agent stopped: parent budget exhausted after ${toolCallsDone} tool call(s).`,
          isError: false,
        }
      }

      const stream = ctx.provider!.stream(request)
      let text = ''
      let hasToolCalls = false
      let usage: UsageTotals = emptyUsage()

      for await (const ev of stream as AsyncIterable<ProviderStreamEvent>) {
        if (ev.kind === 'text-delta') {
          text += ev.delta
        } else if (ev.kind === 'usage') {
          usage = addUsage(usage, ev.usage)
        } else if (ev.kind === 'tool-use') {
          hasToolCalls = true
          const toolResult = await ctx.tools!.execute(ev.call.name, ev.call.input, ctx)
          messages.push(
            { role: 'assistant', content: text, toolCalls: [ev.call] },
            { role: 'tool', content: toolResult.content, toolCallId: ev.call.id },
          )
          text = ''
          toolCallsDone++
        }
      }

      ctx.budget?.addUsage(usage)

      if (text) {
        resultText = text
        messages.push({ role: 'assistant', content: text })
      }

      if (!hasToolCalls) break
      request.messages = messages
    }

    return {
      text: resultText || `Sub-agent completed (${toolCallsDone} tool call(s)).`,
      isError: false,
    }
  } catch (e) {
    return { text: `agent error: ${(e as Error).message}`, isError: true, rateLimited: isRateLimitError(e) }
  }
}
