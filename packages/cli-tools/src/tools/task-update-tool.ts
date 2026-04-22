import type { ToolDefinition, ToolResult, ToolContext } from '@orchentra/cli-core'

interface TaskUpdateInput {
  taskId: string
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  output?: string
}

export const taskUpdateTool: ToolDefinition = {
  name: 'task_update',
  description: 'Update a task status or output.',
  level: 'write',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The task ID to update' },
      status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed', 'cancelled'] },
      output: { type: 'string', description: 'Task output or result' },
    },
    required: ['taskId'],
    additionalProperties: false,
  },
  async execute(args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const input = args as TaskUpdateInput
    if (!input?.taskId) {
      return { content: 'error: taskId is required', isError: true }
    }
    if (!ctx.sharedState) {
      return { content: 'error: shared state not available', isError: true }
    }
    const patch: Record<string, unknown> = {}
    if (input.status) patch.status = input.status
    if (input.output !== undefined) patch.output = input.output
    if (input.status === 'completed' || input.status === 'failed') {
      patch.completedAt = new Date().toISOString()
    }
    ctx.sharedState.taskStore.update(input.taskId, patch)
    const updated = ctx.sharedState.taskStore.get(input.taskId)
    return { content: JSON.stringify(updated, null, 2), isError: false }
  },
}
