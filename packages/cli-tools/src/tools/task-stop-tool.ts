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
    ctx.sharedState.taskStore.cancel(input.taskId)
    const updated = ctx.sharedState.taskStore.get(input.taskId)
    if (!updated) {
      return { content: `error: task not found: ${input.taskId}`, isError: true }
    }
    return {
      content: `Task ${input.taskId} cancelled (was ${updated.status})`,
      isError: false,
    }
  },
}
