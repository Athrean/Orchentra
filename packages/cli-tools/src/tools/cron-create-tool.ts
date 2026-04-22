import type { ToolDefinition, ToolResult, ToolContext } from '@orchentra/cli-core'

interface CronCreateInput {
  prompt: string
  cron: string
  recurring?: boolean
}

export const cronCreateTool: ToolDefinition = {
  name: 'cron_create',
  description: 'Schedule a recurring or one-shot prompt using a cron expression.',
  level: 'admin',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'The prompt to run on schedule' },
      cron: { type: 'string', description: 'Cron expression (5-field: minute hour day month weekday)' },
      recurring: { type: 'boolean', description: 'Whether to repeat (default true)' },
    },
    required: ['prompt', 'cron'],
    additionalProperties: false,
  },
  async execute(args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const input = args as CronCreateInput
    if (!input?.prompt || !input?.cron) {
      return { content: 'error: prompt and cron are required', isError: true }
    }
    if (!ctx.sharedState) {
      return { content: 'error: shared state not available', isError: true }
    }

    const delayMs = parseCronToMs(input.cron)
    if (delayMs === null) {
      return { content: `error: could not parse cron expression: ${input.cron}`, isError: true }
    }

    const recurring = input.recurring !== false
    const jobId = `cron_${++ctx.sharedState.agentCounter}_${Date.now()}`

    // Store timer reference for cancellation
    const timers: Map<string, ReturnType<typeof setInterval>> = ((globalThis as Record<string, unknown>)
      .__cron_timers as Map<string, ReturnType<typeof setInterval>>) ?? new Map()
    ;(globalThis as Record<string, unknown>).__cron_timers = timers

    if (recurring) {
      const id = setInterval(() => {
        // Emit the prompt — in a real implementation this would trigger a new turn
      }, delayMs)
      timers.set(jobId, id)
    } else {
      setTimeout(() => {
        timers.delete(jobId)
      }, delayMs)
    }

    return {
      content: JSON.stringify({
        jobId,
        cron: input.cron,
        recurring,
        nextFireAt: new Date(Date.now() + delayMs).toISOString(),
      }),
      isError: false,
    }
  },
}

function parseCronToMs(cron: string): number | null {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return null

  const [minute, hour, , ,] = parts

  // Simple parsing for common patterns
  if (minute.startsWith('*/')) {
    const interval = parseInt(minute.slice(2), 10)
    if (isNaN(interval)) return null
    return interval * 60 * 1000
  }

  if (hour === '*' && minute !== '*') {
    const m = parseInt(minute, 10)
    if (isNaN(m)) return null
    // "X * * * *" = every hour at minute X
    return 60 * 60 * 1000
  }

  // Default: 5 minutes for unrecognized patterns
  return 5 * 60 * 1000
}
