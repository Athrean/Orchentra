import type { ToolDefinition, ToolResult, ToolContext } from '@orchentra/cli-core'

interface CronDeleteInput {
  jobId: string
}

export const cronDeleteTool: ToolDefinition = {
  name: 'cron_delete',
  description: 'Cancel a scheduled cron job by ID.',
  level: 'admin',
  inputSchema: {
    type: 'object',
    properties: {
      jobId: { type: 'string', description: 'The cron job ID to cancel' },
    },
    required: ['jobId'],
    additionalProperties: false,
  },
  async execute(args: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const input = args as CronDeleteInput
    if (!input?.jobId) {
      return { content: 'error: jobId is required', isError: true }
    }

    const timers = (globalThis as Record<string, unknown>).__cron_timers as
      | Map<string, ReturnType<typeof setInterval>>
      | undefined
    if (!timers || !timers.has(input.jobId)) {
      return { content: `error: cron job not found: ${input.jobId}`, isError: true }
    }

    const timer = timers.get(input.jobId)!
    clearInterval(timer)
    timers.delete(input.jobId)
    return { content: `Cancelled cron job: ${input.jobId}`, isError: false }
  },
}
