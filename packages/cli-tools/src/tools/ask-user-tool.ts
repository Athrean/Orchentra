import type { AskUserOption, ToolContext, ToolDefinition, ToolResult } from '@orchentra/cli-core'

interface AskUserInput {
  prompt?: string
  question?: string
  options?: readonly AskUserOption[]
  multiSelect?: boolean
  allowOther?: boolean
}

export const askUserTool: ToolDefinition = {
  name: 'ask_user',
  description:
    'Ask the user a question and wait for their response. Use free text for clarification or 2-4 structured options for a decision.',
  level: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Legacy free-text question to ask the user' },
      question: { type: 'string', description: 'Structured question to ask the user' },
      options: {
        type: 'array',
        description: 'Optional 2-4 choices to show as an arrow-key selection prompt',
        minItems: 2,
        maxItems: 4,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Optional stable option id' },
            label: { type: 'string', description: 'Visible option label' },
            description: { type: 'string', description: 'Optional short help text for this option' },
          },
          required: ['label'],
          additionalProperties: false,
        },
      },
      multiSelect: { type: 'boolean', description: 'Allow selecting more than one option' },
      allowOther: { type: 'boolean', description: 'Include an Other fallback option. Defaults to true.' },
    },
    required: ['question'],
    additionalProperties: false,
  },
  async execute(args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const input = args as AskUserInput
    const question = stringValue(input?.question) ?? stringValue(input?.prompt)
    if (!question) {
      return { content: 'error: question or prompt is required', isError: true }
    }
    if (!ctx.askUser) {
      return { content: 'error: user interaction not available (non-interactive mode)', isError: true }
    }

    const optionsResult = normalizeOptions(input?.options)
    if (optionsResult.error) return { content: `error: ${optionsResult.error}`, isError: true }

    try {
      const response = optionsResult.options
        ? await ctx.askUser({
            question,
            options: optionsResult.options,
            multiSelect: input.multiSelect === true,
            allowOther: input.allowOther !== false,
          })
        : await ctx.askUser(question)
      return { content: response, isError: false }
    } catch (e) {
      return { content: `ask_user error: ${(e as Error).message}`, isError: true }
    }
  },
}

function stringValue(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeOptions(input: readonly AskUserOption[] | undefined): {
  options?: readonly AskUserOption[]
  error?: string
} {
  if (input === undefined) return {}
  if (!Array.isArray(input) || input.length < 2 || input.length > 4) {
    return { error: 'structured ask_user requires 2-4 options' }
  }

  const options: AskUserOption[] = []
  for (const option of input) {
    const label = stringValue(option?.label)
    if (!label) return { error: 'each option label must be a non-empty string' }

    const normalized: AskUserOption = { label }
    const id = stringValue(option.id)
    const description = stringValue(option.description)
    if (id) Object.assign(normalized, { id })
    if (description) Object.assign(normalized, { description })
    options.push(normalized)
  }

  return { options }
}
