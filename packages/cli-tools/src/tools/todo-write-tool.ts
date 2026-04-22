import { randomUUID } from 'node:crypto'
import type { ToolDefinition, ToolResult, ToolContext, TodoItem } from '@orchentra/cli-core'

interface TodoWriteInput {
  todos: Array<{
    content: string
    status?: 'pending' | 'in_progress' | 'completed'
    activeForm?: string
  }>
}

export const todoWriteTool: ToolDefinition = {
  name: 'todo_write',
  description: 'Replace the current todo list. Provide the full list of todos to display.',
  level: 'write',
  inputSchema: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'Task description' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
            activeForm: { type: 'string', description: 'Present continuous form shown during work' },
          },
          required: ['content'],
          additionalProperties: false,
        },
      },
    },
    required: ['todos'],
    additionalProperties: false,
  },
  async execute(args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const input = args as TodoWriteInput
    if (!input?.todos || !Array.isArray(input.todos)) {
      return { content: 'error: todos array is required', isError: true }
    }
    if (!ctx.sharedState) {
      return { content: 'error: shared state not available', isError: true }
    }
    const todos: TodoItem[] = input.todos.map((t) => ({
      id: randomUUID().slice(0, 8),
      content: t.content,
      status: t.status ?? 'pending',
      activeForm: t.activeForm,
    }))
    ctx.sharedState.todos = todos
    const summary = todos
      .map((t) => `[${t.status === 'completed' ? 'x' : t.status === 'in_progress' ? '>' : ' '}] ${t.content}`)
      .join('\n')
    return { content: summary, isError: false }
  },
}
