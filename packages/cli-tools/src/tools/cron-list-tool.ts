import type { ToolDefinition, ToolResult, ToolContext } from '@orchentra/cli-core'

export const cronListTool: ToolDefinition = {
  name: 'cron_list',
  description: 'List all active scheduled cron jobs.',
  level: 'read',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  async execute(_args: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const timers = (globalThis as Record<string, unknown>).__cron_timers as
      | Map<string, ReturnType<typeof setInterval>>
      | undefined
    if (!timers || timers.size === 0) {
      return { content: 'No active cron jobs.', isError: false }
    }
    const jobIds = Array.from(timers.keys())
    return { content: `Active cron jobs:\n${jobIds.map((id) => `  ${id}`).join('\n')}`, isError: false }
  },
}
