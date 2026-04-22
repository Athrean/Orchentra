import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ToolDefinition, ToolResult, ToolContext } from '@orchentra/cli-core'

interface NotebookEditInput {
  notebook_path: string
  cell_number: number
  new_source: string
  cell_type?: 'code' | 'markdown'
  edit_mode?: 'replace' | 'insert' | 'delete'
}

export const notebookEditTool: ToolDefinition = {
  name: 'notebook_edit',
  description: 'Edit a Jupyter notebook cell. Supports replace, insert, and delete operations.',
  level: 'write',
  inputSchema: {
    type: 'object',
    properties: {
      notebook_path: { type: 'string', description: 'Absolute path to the .ipynb file' },
      cell_number: { type: 'integer', description: '0-indexed cell number to edit' },
      new_source: { type: 'string', description: 'New cell source content' },
      cell_type: { type: 'string', enum: ['code', 'markdown'], description: 'Cell type for insert' },
      edit_mode: { type: 'string', enum: ['replace', 'insert', 'delete'], description: 'Edit mode (default: replace)' },
    },
    required: ['notebook_path', 'cell_number'],
    additionalProperties: false,
  },
  async execute(args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const input = args as NotebookEditInput
    if (!input?.notebook_path) {
      return { content: 'error: notebook_path is required', isError: true }
    }

    const filePath = resolve(ctx.cwd, input.notebook_path)
    if (!filePath.endsWith('.ipynb')) {
      return { content: 'error: file must be a .ipynb notebook', isError: true }
    }

    try {
      const raw = readFileSync(filePath, 'utf8')
      const nb = JSON.parse(raw) as { cells: Array<Record<string, unknown>> }
      const mode = input.edit_mode ?? 'replace'

      if (mode === 'delete') {
        if (input.cell_number < 0 || input.cell_number >= nb.cells.length) {
          return { content: `error: cell ${input.cell_number} out of range (0-${nb.cells.length - 1})`, isError: true }
        }
        nb.cells.splice(input.cell_number, 1)
      } else if (mode === 'insert') {
        const cell: Record<string, unknown> = {
          cell_type: input.cell_type ?? 'code',
          source: input.new_source ?? '',
          metadata: {},
          outputs: [],
          execution_count: null,
        }
        nb.cells.splice(input.cell_number, 0, cell)
      } else {
        if (input.cell_number < 0 || input.cell_number >= nb.cells.length) {
          return { content: `error: cell ${input.cell_number} out of range (0-${nb.cells.length - 1})`, isError: true }
        }
        nb.cells[input.cell_number].source = input.new_source ?? ''
      }

      writeFileSync(filePath, JSON.stringify(nb, null, 1) + '\n')
      return { content: `Notebook ${filePath} updated (${mode} cell ${input.cell_number})`, isError: false }
    } catch (e) {
      return { content: `notebook_edit error: ${(e as Error).message}`, isError: true }
    }
  },
}
