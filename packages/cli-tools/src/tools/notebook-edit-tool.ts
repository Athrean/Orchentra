import type { ToolDefinition, ToolResult, ToolContext } from '@orchentra/cli-core'
import { readFileInWorkspace, writeFileInWorkspace } from '../file-ops'

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

    if (!input.notebook_path.endsWith('.ipynb')) {
      return { content: 'error: file must be a .ipynb notebook', isError: true }
    }

    try {
      const read = await readFileInWorkspace(input.notebook_path, ctx.cwd)
      const raw = read.file.content
      const filePath = read.file.filePath
      const nb = JSON.parse(raw) as { cells: Array<Record<string, unknown>> }
      const mode = input.edit_mode ?? 'replace'

      if (mode !== 'delete' && (input.new_source === undefined || input.new_source === null)) {
        return {
          content: `error: new_source is required for edit_mode="${mode}"`,
          isError: true,
        }
      }

      if (mode === 'delete') {
        if (input.cell_number < 0 || input.cell_number >= nb.cells.length) {
          return { content: `error: cell ${input.cell_number} out of range (0-${nb.cells.length - 1})`, isError: true }
        }
        nb.cells.splice(input.cell_number, 1)
      } else if (mode === 'insert') {
        const cellType = input.cell_type ?? 'code'
        const cell: Record<string, unknown> = {
          cell_type: cellType,
          source: input.new_source,
          metadata: {},
        }
        if (cellType === 'code') {
          cell.outputs = []
          cell.execution_count = null
        }
        nb.cells.splice(input.cell_number, 0, cell)
      } else {
        if (input.cell_number < 0 || input.cell_number >= nb.cells.length) {
          return { content: `error: cell ${input.cell_number} out of range (0-${nb.cells.length - 1})`, isError: true }
        }
        nb.cells[input.cell_number].source = input.new_source
      }

      await writeFileInWorkspace(filePath, JSON.stringify(nb, null, 1) + '\n', ctx.cwd)
      return { content: `Notebook ${filePath} updated (${mode} cell ${input.cell_number})`, isError: false }
    } catch (e) {
      return { content: `notebook_edit error: ${(e as Error).message}`, isError: true }
    }
  },
}
