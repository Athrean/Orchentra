import type { ToolDefinition, ToolResult, ToolContext } from '@orchentra/cli-core'
import { diagnosticsReport } from '../diagnostics'
import { validateCommand } from '../bash-validation'
import { resolveBashSpawn } from './bash-tool'

interface DiagnosticsInput {
  command?: string
}

// Default to `tsc --noEmit`; the agent can pass a `command` override (e.g. an
// eslint invocation). A real LSP client is deferred until a non-TS workspace
// needs it — a shell command covers the value here.
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
    // The override is an arbitrary shell string on a read-level tool, so it
    // gets the same gate and sandbox as the bash tool — otherwise diagnostics
    // is a permission bypass (audit-flagged hole).
    const validation = validateCommand(command, ctx.permissionMode ?? 'workspace-write', ctx.cwd)
    if (validation.kind === 'block') {
      return { content: `blocked: ${validation.reason}`, isError: true }
    }
    const spawn = resolveBashSpawn({ command }, { cwd: ctx.cwd, permissionMode: ctx.permissionMode })
    try {
      const env: Record<string, string> = { ...(process.env as Record<string, string>) }
      for (const [k, v] of spawn.env ?? []) env[k] = v
      const proc = Bun.spawn([spawn.program, ...spawn.args], { cwd: ctx.cwd, stdout: 'pipe', stderr: 'pipe', env })
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
