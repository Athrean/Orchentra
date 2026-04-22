import type { ToolDefinition, ToolResult, ToolContext } from '@orchentra/cli-core'

interface TaskCreateInput {
  prompt: string
}

export const taskCreateTool: ToolDefinition = {
  name: 'task_create',
  description: 'Create a background task with a prompt. Returns a task ID for later polling.',
  level: 'admin',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'The task prompt or instruction' },
    },
    required: ['prompt'],
    additionalProperties: false,
  },
  async execute(args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const input = args as TaskCreateInput
    if (!input?.prompt) {
      return { content: 'error: prompt is required', isError: true }
    }
    if (!ctx.sharedState) {
      return { content: 'error: shared state not available', isError: true }
    }
    const handle = ctx.sharedState.taskStore.create(input.prompt)
    return {
      content: JSON.stringify({ taskId: handle.taskId, status: handle.status }),
      isError: false,
    }
  },
}
