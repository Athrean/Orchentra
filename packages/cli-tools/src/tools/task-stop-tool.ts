import type { ToolDefinition, ToolResult, ToolContext } from '@orchentra/cli-core'

interface TaskStopInput {
  taskId: string
}

export const taskStopTool: ToolDefinition = {
  name: 'task_stop',
  description: 'Cancel a running task.',
  level: 'admin',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The task ID to cancel' },
    },
    required: ['taskId'],
    additionalProperties: false,
  },
  async execute(args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const input = args as TaskStopInput
    if (!input?.taskId) {
      return { content: 'error: taskId is required', isError: true }
    }
    if (!ctx.sharedState) {
      return { content: 'error: shared state not available', isError: true }
    }
    const existing = ctx.sharedState.taskStore.get(input.taskId)
    if (!existing) {
      return { content: `error: task not found: ${input.taskId}`, isError: true }
    }
    const previousStatus = existing.status
    ctx.sharedState.taskStore.cancel(input.taskId)
    return {
      content: `Task ${input.taskId} cancelled (was ${previousStatus})`,
      isError: false,
    }
  },
}
