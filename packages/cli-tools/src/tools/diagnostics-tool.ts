import type { ToolDefinition, ToolResult, ToolContext } from '@orchentra/cli-core'
import { diagnosticsReport } from '../diagnostics'

interface DiagnosticsInput {
  command?: string
}

// simplify: default to `tsc --noEmit`; the agent can pass a `command` override
// (e.g. an eslint invocation). A real LSP client is deferred until a non-TS
// workspace needs it — a shell command covers the value here.
const DEFAULT_COMMAND = 'tsc --noEmit'

export const diagnosticsTool: ToolDefinition = {
  name: 'diagnostics',
  description:
    'Run the workspace type/lint check and return only errors+warnings (file:line), deduped and capped. Use after editing to see what broke.',
  level: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Override the check command (default: tsc --noEmit).' },
    },
    additionalProperties: false,
  },
  async execute(args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const input = (args ?? {}) as DiagnosticsInput
    const command = input.command?.trim() || DEFAULT_COMMAND
    try {
      const proc = Bun.spawn(['sh', '-c', command], { cwd: ctx.cwd, stdout: 'pipe', stderr: 'pipe' })
      const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
      await proc.exited
      // Finding diagnostics is a successful run — isError is reserved for the
      // command failing to execute, not for the code under test having errors.
      return { content: diagnosticsReport(`${stdout}\n${stderr}`).text, isError: false }
    } catch (err) {
      return { content: `diagnostics: failed to run '${command}': ${(err as Error).message}`, isError: true }
    }
  },
}
