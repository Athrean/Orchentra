import type { ToolDefinition, ToolResult, ToolContext } from '@orchentra/cli-core'

interface TaskGetInput {
  taskId: string
}

export const taskGetTool: ToolDefinition = {
  name: 'task_get',
  description: 'Get task status and output by ID.',
  level: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The task ID to retrieve' },
    },
    required: ['taskId'],
    additionalProperties: false,
  },
  async execute(args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const input = args as TaskGetInput
    if (!input?.taskId) {
      return { content: 'error: taskId is required', isError: true }
    }
    if (!ctx.sharedState) {
      return { content: 'error: shared state not available', isError: true }
    }
    const handle = ctx.sharedState.taskStore.get(input.taskId)
    if (!handle) {
      return { content: `error: task not found: ${input.taskId}`, isError: true }
    }
    return { content: JSON.stringify(handle, null, 2), isError: false }
  },
}
