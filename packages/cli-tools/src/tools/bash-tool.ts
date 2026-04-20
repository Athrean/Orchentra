import type { ToolDefinition, ToolResult, ToolContext } from '@orchentra/cli-core'
import { validateCommand } from '../bash-validation'

interface BashInput {
  command: string
  timeout?: number
  description?: string
  run_in_background?: boolean
}

export const bashTool: ToolDefinition = {
  name: 'bash',
  description: 'Execute a shell command in the current workspace.',
  level: 'admin',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string' },
      timeout: { type: 'integer', minimum: 1 },
      description: { type: 'string' },
      run_in_background: { type: 'boolean' },
    },
    required: ['command'],
    additionalProperties: false,
  },
  async execute(args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const input = args as BashInput
    if (!input?.command) {
      return { content: 'error: command is required', isError: true }
    }

    const validation = validateCommand(input.command, 'workspace-write' as never, ctx.cwd)
    if (validation.kind === 'block') {
      return { content: `blocked: ${validation.reason}`, isError: true }
    }

    const timeoutMs = input.timeout ? input.timeout * 1000 : 120_000

    try {
      const proc = Bun.spawn(['sh', '-c', input.command], {
        cwd: ctx.cwd,
        stdout: 'pipe',
        stderr: 'pipe',
      })

      const timeout = setTimeout(() => proc.kill(), timeoutMs)
      const exitCode = await proc.exited
      clearTimeout(timeout)

      const stdout = await new Response(proc.stdout).text()
      const stderr = await new Response(proc.stderr).text()

      const output = stdout + (stderr ? `\n${stderr}` : '')
      return {
        content: exitCode === 0 ? output : `exit code ${exitCode}\n${output}`,
        isError: exitCode !== 0,
      }
    } catch (e) {
      return { content: `execution error: ${(e as Error).message}`, isError: true }
    }
  },
}
