import type { ToolDefinition, ToolResult, ToolContext } from '@orchentra/cli-core'

export const taskListTool: ToolDefinition = {
  name: 'task_list',
  description: 'List all tasks with their statuses.',
  level: 'read',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  async execute(_args: unknown, ctx: ToolContext): Promise<ToolResult> {
    if (!ctx.sharedState) {
      return { content: 'error: shared state not available', isError: true }
    }
    const tasks = ctx.sharedState.taskStore.list()
    if (tasks.length === 0) {
      return { content: 'No tasks.', isError: false }
    }
    const lines = tasks.map((t) => `${t.taskId}  ${t.status}  ${t.prompt?.slice(0, 60) ?? ''}`)
    return { content: lines.join('\n'), isError: false }
  },
}
