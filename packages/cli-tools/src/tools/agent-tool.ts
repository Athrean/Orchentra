import type {
  ToolDefinition,
  ToolResult,
  ToolContext,
  ChatMessage,
  ProviderRequest,
  ProviderStreamEvent,
} from '@orchentra/cli-core'

interface AgentInput {
  prompt: string
  model?: string
  description?: string
}

export const agentTool: ToolDefinition = {
  name: 'agent',
  description:
    'Spawn a sub-agent to perform a task. The sub-agent runs a nested conversation loop with the same tools.',
  level: 'admin',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'The task for the sub-agent' },
      model: { type: 'string', description: 'Optional model override for the sub-agent' },
      description: { type: 'string', description: 'Short description of what the agent will do' },
    },
    required: ['prompt'],
    additionalProperties: false,
  },
  async execute(args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const input = args as AgentInput
    if (!input?.prompt) {
      return { content: 'error: prompt is required', isError: true }
    }
    if (!ctx.provider || !ctx.tools) {
      return { content: 'error: provider and tools not available for sub-agent', isError: true }
    }

    const model = input.model ?? ctx.model
    if (!model) {
      return {
        content: 'error: no model available for sub-agent (pass "model" or ensure ToolContext carries one)',
        isError: true,
      }
    }

    try {
      const messages: ChatMessage[] = [{ role: 'user', content: input.prompt }]
      const toolSchemas = ctx.tools.list()

      const request: ProviderRequest = {
        systemStatic: 'You are a helpful coding assistant completing a specific sub-task. Be thorough but concise.',
        systemDynamic: '',
        messages,
        tools: toolSchemas,
        model,
        maxOutputTokens: 4096,
      }

      let resultText = ''
      let toolCallsDone = 0
      const maxIterations = 10

      for (let i = 0; i < maxIterations; i++) {
        const stream = ctx.provider.stream(request)
        let text = ''
        let hasToolCalls = false

        for await (const ev of stream as AsyncIterable<ProviderStreamEvent>) {
          if (ev.kind === 'text-delta') {
            text += ev.delta
          } else if (ev.kind === 'tool-use') {
            hasToolCalls = true
            const toolResult = await ctx.tools.execute(ev.call.name, ev.call.input, ctx)
            messages.push(
              { role: 'assistant', content: text, toolCalls: [ev.call] },
              { role: 'tool', content: toolResult.content, toolCallId: ev.call.id },
            )
            text = ''
            toolCallsDone++
          }
        }

        if (text) {
          resultText = text
          messages.push({ role: 'assistant', content: text })
        }

        if (!hasToolCalls) break
        request.messages = messages
      }

      return {
        content: resultText || `Sub-agent completed (${toolCallsDone} tool calls).`,
        isError: false,
      }
    } catch (e) {
      return { content: `agent error: ${(e as Error).message}`, isError: true }
    }
  },
}
