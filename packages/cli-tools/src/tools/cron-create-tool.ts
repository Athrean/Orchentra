import type { ToolDefinition, ToolResult, ToolContext } from '@orchentra/cli-core'

interface CronCreateInput {
  prompt: string
  cron: string
  recurring?: boolean
}

export const cronCreateTool: ToolDefinition = {
  name: 'cron_create',
  description:
    'Schedule a recurring or one-shot prompt using a cron expression. NOTE: execution of scheduled prompts is not yet wired into the conversation runtime — this tool currently returns a not-implemented error so callers do not rely on a silent no-op.',
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
  async execute(args: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const input = args as CronCreateInput
    if (!input?.prompt || !input?.cron) {
      return { content: 'error: prompt and cron are required', isError: true }
    }
    return {
      content:
        'error: cron_create is not yet implemented. Scheduled prompts cannot be executed by the current conversation runtime. See cron_list and cron_delete for placeholders.',
      isError: true,
    }
  },
}
