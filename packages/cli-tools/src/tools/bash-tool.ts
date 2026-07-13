import {
  defaultSandboxConfig,
  prepareSandboxDirs,
  wrapBashCommand,
  type PermissionMode,
  type ProcessSupervisor,
  type SandboxStatus,
  type ToolDefinition,
  type ToolResult,
  type ToolContext,
} from '@orchentra/cli-core'
import { validateCommand } from '../bash-validation'

/**
 * How long a `run_in_background` call waits for a dev server to report ready
 * (URL scraped + probe passes) before returning the handle anyway. Long enough
 * for a dev server to bind and print its URL; short enough that a non-server
 * background job doesn't stall the prompt.
 */
const BACKGROUND_READY_TIMEOUT_MS = 10_000

interface BashInput {
  command: string
  timeout?: number
  description?: string
  run_in_background?: boolean
}

interface BashSpawnContext {
  cwd: string
  permissionMode?: PermissionMode
}

interface ResolvedBashSpawn {
  program: string
  args: string[]
  env?: Array<readonly [string, string]>
  sandboxStatus?: SandboxStatus
}

export function formatSandboxStatusLine(status: SandboxStatus): string {
  if (!status.enabled && !status.filesystem_active) return ''
  const parts: string[] = ['sandbox', `mode=${status.filesystem_mode}`]
  parts.push(status.filesystem_active ? 'filesystem=active' : 'filesystem=inactive')
  if (status.requested.network_isolation) {
    parts.push(status.network_active ? 'network=isolated' : 'network=requested-not-active')
  }
  if (status.in_container) parts.push(`container=${status.container_markers[0] ?? 'detected'}`)
  if (status.fallback_reason) parts.push(`fallback=${status.fallback_reason}`)
  return `[${parts.join(' ')}]`
}

export function resolveBashSpawn(input: BashInput, ctx: BashSpawnContext): ResolvedBashSpawn {
  // Disabling the sandbox is a human decision (env var or permission mode) —
  // never a model-visible input flag (audit-flagged hole).
  if (process.env.ORCHENTRA_SANDBOX_DISABLED === '1' || ctx.permissionMode === 'danger-full-access') {
    return { program: 'sh', args: ['-c', input.command] }
  }
  const wrap = wrapBashCommand(input.command, ctx.cwd, {
    config: defaultSandboxConfig(),
    overrides: {},
  })
  if (!wrap || wrap.command === null) {
    return { program: 'sh', args: ['-c', input.command], sandboxStatus: wrap?.status }
  }
  return {
    program: wrap.command.program,
    args: wrap.command.args,
    env: wrap.command.env,
    sandboxStatus: wrap.status,
  }
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

    const validation = validateCommand(input.command, ctx.permissionMode ?? 'workspace-write', ctx.cwd)
    if (validation.kind === 'block') {
      return { content: `blocked: ${validation.reason}`, isError: true }
    }

    // Background commands (dev servers) go through the run-scoped supervisor so
    // the call returns a handle + readiness/URL instead of blocking on exit.
    // Without a supervisor in context we fall back to running foreground.
    const supervisor = ctx.sharedState?.processSupervisor
    if (input.run_in_background && supervisor) {
      return startBackground(input, ctx, supervisor)
    }

    const timeoutMs = input.timeout ? input.timeout * 1000 : 120_000
    const spawn = resolveBashSpawn(input, ctx)

    if (spawn.sandboxStatus?.enabled) {
      try {
        prepareSandboxDirs(ctx.cwd)
      } catch {
        // best-effort; sandbox-exec will surface the real failure
      }
    }

    try {
      const env: Record<string, string> = { ...(process.env as Record<string, string>) }
      for (const [k, v] of spawn.env ?? []) env[k] = v

      const proc = Bun.spawn([spawn.program, ...spawn.args], {
        cwd: ctx.cwd,
        stdout: 'pipe',
        stderr: 'pipe',
        env,
      })

      const timeout = setTimeout(() => proc.kill(), timeoutMs)
      const exitCode = await proc.exited
      clearTimeout(timeout)

      const stdout = await new Response(proc.stdout).text()
      const stderr = await new Response(proc.stderr).text()

      const output = stdout + (stderr ? `\n${stderr}` : '')
      const statusLine = spawn.sandboxStatus ? formatSandboxStatusLine(spawn.sandboxStatus) : ''
      const body = exitCode === 0 ? output : `exit code ${exitCode}\n${output}`
      return {
        content: statusLine.length > 0 ? `${body}\n${statusLine}` : body,
        isError: exitCode !== 0,
        data: { exitCode, sandboxed: spawn.sandboxStatus?.enabled ?? false },
        evidence: [
          {
            kind: 'exit-status',
            summary: `exit code ${exitCode}`,
            detail: { exitCode, command: input.command, sandboxed: spawn.sandboxStatus?.enabled ?? false },
          },
        ],
      }
    } catch (e) {
      return { content: `execution error: ${(e as Error).message}`, isError: true }
    }
  },
}

async function startBackground(input: BashInput, ctx: ToolContext, supervisor: ProcessSupervisor): Promise<ToolResult> {
  const proc = supervisor.start({
    command: input.command,
    cwd: ctx.cwd,
    label: input.description ?? input.command,
    // Empty readiness spec: no known port, so discover the URL by scraping the
    // dev server's own startup log, then probe it.
    readiness: {},
  })
  const ready = await supervisor.waitUntilReady(proc.id, BACKGROUND_READY_TIMEOUT_MS)

  const summary =
    ready.status === 'ready'
      ? `background process ready${ready.url ? ` at ${ready.url}` : ''}`
      : ready.status === 'failed' || ready.status === 'exited'
        ? `background process ${ready.status}${ready.exitCode != null ? ` (exit ${ready.exitCode})` : ''}`
        : `background process started (status ${ready.status})`

  const handleParts = [`[background pid=${ready.pid ?? '?'} id=${proc.id} status=${ready.status}`]
  if (ready.url) handleParts.push(`url=${ready.url}`)
  handleParts.push('unsandboxed]')

  return {
    content: `${summary}\n${handleParts.join(' ')}`,
    isError: ready.status === 'failed',
    data: {
      backgroundProcessId: proc.id,
      pid: ready.pid,
      status: ready.status,
      url: ready.url,
      port: ready.port,
    },
    evidence: [
      {
        kind: 'process-status',
        summary,
        detail: {
          id: proc.id,
          command: input.command,
          status: ready.status,
          url: ready.url,
          port: ready.port,
          exitCode: ready.exitCode,
          sandboxed: false,
        },
      },
    ],
  }
}
