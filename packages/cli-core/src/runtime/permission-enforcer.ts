import { permissionModeRank } from './permissions'
import type { PermissionMode, PermissionPolicy } from './permissions'

export type EnforcementResult =
  | { kind: 'allowed' }
  | { kind: 'denied'; tool: string; activeMode: string; requiredMode: string; reason: string }

export class PermissionEnforcer {
  private readonly policy: PermissionPolicy

  constructor(policy: PermissionPolicy) {
    this.policy = policy
  }

  check(toolName: string, input: string): EnforcementResult {
    if (this.policy.activeMode() === 'prompt') {
      return { kind: 'allowed' }
    }

    const outcome = this.policy.authorize(toolName, input)

    if (outcome.kind === 'allow') return { kind: 'allowed' }

    return {
      kind: 'denied',
      tool: toolName,
      activeMode: this.policy.activeMode(),
      requiredMode: this.policy.requiredModeFor(toolName),
      reason: outcome.reason,
    }
  }

  isAllowed(toolName: string, input: string): boolean {
    return this.check(toolName, input).kind === 'allowed'
  }

  checkWithRequiredMode(toolName: string, input: string, requiredMode: PermissionMode): EnforcementResult {
    if (this.policy.activeMode() === 'prompt') {
      return { kind: 'allowed' }
    }

    const activeMode = this.policy.activeMode()

    if (permissionModeRank(activeMode) >= permissionModeRank(requiredMode)) {
      return { kind: 'allowed' }
    }

    return {
      kind: 'denied',
      tool: toolName,
      activeMode,
      requiredMode,
      reason: `'${toolName}' with input '${input}' requires '${requiredMode}' permission, but current mode is '${activeMode}'`,
    }
  }

  activeMode(): PermissionMode {
    return this.policy.activeMode()
  }

  checkFileWrite(path: string, workspaceRoot: string): EnforcementResult {
    const mode = this.policy.activeMode()

    if (mode === 'read-only') {
      return {
        kind: 'denied',
        tool: 'write_file',
        activeMode: mode,
        requiredMode: 'workspace-write',
        reason: `file writes are not allowed in '${mode}' mode`,
      }
    }

    if (mode === 'workspace-write') {
      if (isWithinWorkspace(path, workspaceRoot)) {
        return { kind: 'allowed' }
      }
      return {
        kind: 'denied',
        tool: 'write_file',
        activeMode: mode,
        requiredMode: 'danger-full-access',
        reason: `path '${path}' is outside workspace root '${workspaceRoot}'`,
      }
    }

    if (mode === 'prompt') {
      return {
        kind: 'denied',
        tool: 'write_file',
        activeMode: mode,
        requiredMode: 'workspace-write',
        reason: 'file write requires confirmation in prompt mode',
      }
    }

    return { kind: 'allowed' }
  }

  checkBash(command: string): EnforcementResult {
    const mode = this.policy.activeMode()

    if (mode === 'read-only') {
      if (isReadOnlyCommand(command)) {
        return { kind: 'allowed' }
      }
      return {
        kind: 'denied',
        tool: 'bash',
        activeMode: mode,
        requiredMode: 'workspace-write',
        reason: `command may modify state; not allowed in '${mode}' mode`,
      }
    }

    if (mode === 'prompt') {
      return {
        kind: 'denied',
        tool: 'bash',
        activeMode: mode,
        requiredMode: 'danger-full-access',
        reason: 'bash requires confirmation in prompt mode',
      }
    }

    return { kind: 'allowed' }
  }
}

export function isWithinWorkspace(path: string, workspaceRoot: string): boolean {
  const normalized = path.startsWith('/') ? path : `${workspaceRoot}/${path}`

  const root = workspaceRoot.endsWith('/') ? workspaceRoot : `${workspaceRoot}/`

  return normalized.startsWith(root) || normalized === workspaceRoot.replace(/\/$/, '')
}

const READ_ONLY_COMMANDS = new Set([
  'cat',
  'head',
  'tail',
  'less',
  'more',
  'wc',
  'ls',
  'find',
  'grep',
  'rg',
  'awk',
  'sed',
  'echo',
  'printf',
  'which',
  'where',
  'whoami',
  'pwd',
  'env',
  'printenv',
  'date',
  'cal',
  'df',
  'du',
  'free',
  'uptime',
  'uname',
  'file',
  'stat',
  'diff',
  'sort',
  'uniq',
  'tr',
  'cut',
  'paste',
  'tee',
  'xargs',
  'test',
  'true',
  'false',
  'type',
  'readlink',
  'realpath',
  'basename',
  'dirname',
  'sha256sum',
  'md5sum',
  'b3sum',
  'xxd',
  'hexdump',
  'od',
  'strings',
  'tree',
  'jq',
  'yq',
  'python3',
  'python',
  'node',
  'ruby',
  'cargo',
  'rustc',
  'git',
  'gh',
])

export function isReadOnlyCommand(command: string): boolean {
  const firstToken = command.trim().split(/\s+/)[0]?.split('/').pop() ?? ''

  return (
    READ_ONLY_COMMANDS.has(firstToken) &&
    !command.includes('-i ') &&
    !command.includes('--in-place') &&
    !command.includes(' > ') &&
    !command.includes(' >> ')
  )
}
