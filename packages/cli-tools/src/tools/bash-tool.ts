import {
  defaultSandboxConfig,
  prepareSandboxDirs,
  wrapBashCommand,
  type PermissionMode,
  type SandboxStatus,
  type ToolDefinition,
  type ToolResult,
  type ToolContext,
} from '@orchentra/cli-core'
import { validateCommand } from '../bash-validation'

interface BashInput {
  command: string
  timeout?: number
  description?: string
  run_in_background?: boolean
  dangerously_disable_sandbox?: boolean
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

export function resolveBashSpawn(input: BashInput, ctx: BashSpawnContext): ResolvedBashSpawn {
  if (
    input.dangerously_disable_sandbox ||
    process.env.ORCHENTRA_SANDBOX_DISABLED === '1' ||
    ctx.permissionMode === 'danger-full-access'
  ) {
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
      dangerously_disable_sandbox: { type: 'boolean' },
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
      return {
        content: exitCode === 0 ? output : `exit code ${exitCode}\n${output}`,
        isError: exitCode !== 0,
      }
    } catch (e) {
      return { content: `execution error: ${(e as Error).message}`, isError: true }
    }
  },
}
