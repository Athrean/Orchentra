import type { ToolDefinition, ToolResult, ToolContext } from '@orchentra/cli-core'

interface AskUserInput {
  prompt: string
}

export const askUserTool: ToolDefinition = {
  name: 'ask_user',
  description: 'Ask the user a question and wait for their response. Use when you need clarification or a decision.',
  level: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'The question to ask the user' },
    },
    required: ['prompt'],
    additionalProperties: false,
  },
  async execute(args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const input = args as AskUserInput
    if (!input?.prompt) {
      return { content: 'error: prompt is required', isError: true }
    }
    if (!ctx.askUser) {
      return { content: 'error: user interaction not available (non-interactive mode)', isError: true }
    }
    try {
      const response = await ctx.askUser(input.prompt)
      return { content: response, isError: false }
    } catch (e) {
      return { content: `ask_user error: ${(e as Error).message}`, isError: true }
    }
  },
}
