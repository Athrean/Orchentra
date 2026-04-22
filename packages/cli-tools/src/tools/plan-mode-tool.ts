import type { ToolDefinition, ToolResult, ToolContext } from '@orchentra/cli-core'

export const enterPlanModeTool: ToolDefinition = {
  name: 'enter_plan_mode',
  description:
    'Enter planning mode. The assistant will plan and reason without executing tools until exit_plan_mode is called.',
  level: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      reason: { type: 'string', description: 'Why planning mode is needed' },
    },
    additionalProperties: false,
  },
  async execute(_args: unknown, ctx: ToolContext): Promise<ToolResult> {
    if (!ctx.sharedState) {
      return { content: 'error: shared state not available', isError: true }
    }
    ctx.sharedState.planMode = true
    return {
      content: 'Entered planning mode. Tools will not be executed. Use exit_plan_mode when ready.',
      isError: false,
    }
  },
}

export const exitPlanModeTool: ToolDefinition = {
  name: 'exit_plan_mode',
  description: 'Exit planning mode and resume normal tool execution.',
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
    ctx.sharedState.planMode = false
    return { content: 'Exited planning mode. Tool execution resumed.', isError: false }
  },
}
