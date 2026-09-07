import {
  PROGRAM_CAPABILITY_SIGNATURES,
  type ToolContext,
  type ToolDefinition,
  type ToolResult,
} from '@orchentra/cli-core'

interface RlmExecuteInput {
  code: string
}

export const rlmExecuteTool: ToolDefinition = {
  name: 'rlm_execute',
  description: `Execute bounded JavaScript in the persistent, capability-empty RLM environment. Use an async IIFE and await every capability call. Available: ${PROGRAM_CAPABILITY_SIGNATURES.join(', ')}. The result must be JSON-serializable.`,
  level: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      code: { type: 'string', minLength: 1, maxLength: 32000 },
    },
    required: ['code'],
    additionalProperties: false,
  },
  async execute(args: unknown, ctx: ToolContext): Promise<ToolResult> {
    if (!ctx.programEnvironment) {
      return { content: 'RLM program environment unavailable outside the RLM execution profile', isError: true }
    }
    try {
      const result = await ctx.programEnvironment.execute((args as RlmExecuteInput).code)
      const operationSummary =
        result.operations.length > 0
          ? `\n[${result.operations.length} governed operation(s), ${result.durationMs} ms]`
          : `\n[no host operations, ${result.durationMs} ms]`
      return {
        content: `${JSON.stringify(result.value)}${operationSummary}`,
        isError: false,
        data: result,
        ...(result.effects.images.length > 0 ? { images: [...result.effects.images] } : {}),
        ...(result.effects.evidence.length > 0 ? { evidence: [...result.effects.evidence] } : {}),
        ...(result.effects.artifacts.length > 0 ? { artifacts: [...result.effects.artifacts] } : {}),
      }
    } catch (error) {
      return { content: error instanceof Error ? error.message : String(error), isError: true }
    }
  },
}
