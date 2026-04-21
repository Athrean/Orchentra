import type { PermissionMode } from '@orchentra/cli-core'

export type CliAction =
  | { kind: 'version' }
  | { kind: 'help' }
  | { kind: 'init' }
  | {
      kind: 'prompt'
      prompt: string
      model: string
      permissionMode: PermissionMode
    }
  | { kind: 'repl'; model: string; permissionMode: PermissionMode }
  | { kind: 'resume'; sessionPath: string }
  | {
      kind: 'investigate'
      owner: string
      repo: string
      runId: number
      model: string
      permissionMode: PermissionMode
    }
  | {
      kind: 'triage'
      owner: string
      repo: string
      runId: number
      model: string
      permissionMode: PermissionMode
    }
  | {
      kind: 'fix'
      owner: string
      repo: string
      runId: number
      model: string
      permissionMode: PermissionMode
    }

const VALID_PERMISSION_MODES: PermissionMode[] = [
  'read-only',
  'workspace-write',
  'danger-full-access',
  'prompt',
  'allow',
]

export function parseArgs(argv: string[]): CliAction {
  const args = argv.slice(2)
  if (args.length === 0) {
    return { kind: 'repl', model: defaultModel(), permissionMode: 'workspace-write' }
  }

  const first = args[0]

  if (first === '--version' || first === '-V' || first === 'version') {
    return { kind: 'version' }
  }
  if (first === '--help' || first === '-h' || first === 'help') {
    return { kind: 'help' }
  }
  if (first === 'init') {
    return { kind: 'init' }
  }

  if (first === 'investigate' || first === 'triage' || first === 'fix') {
    const target = args[1]
    if (!target) {
      throw new Error(`usage: orchentra ${first} <owner>/<repo>#<run-id>`)
    }
    const parsed = parseRepoRun(target)
    const model = parseModelFlag(args) ?? defaultModel()
    const permissionMode = parsePermissionFlag(args) ?? 'workspace-write'
    return { kind: first, ...parsed, model, permissionMode }
  }

  let model = defaultModel()
  let permissionMode: PermissionMode = 'workspace-write'
  let prompt = ''
  let resumePath: string | undefined

  let i = 0
  while (i < args.length) {
    const arg = args[i]

    if (arg === '--model' || arg === '-m') {
      model = args[++i] ?? model
    } else if (arg.startsWith('--model=')) {
      model = arg.slice('--model='.length)
    } else if (arg === '--permission-mode') {
      const val = args[++i]
      if (!val || !VALID_PERMISSION_MODES.includes(val as PermissionMode)) {
        throw new Error(`invalid permission mode: ${val}. valid: ${VALID_PERMISSION_MODES.join(', ')}`)
      }
      permissionMode = val as PermissionMode
    } else if (arg === '--dangerously-skip-permissions') {
      permissionMode = 'allow'
    } else if (arg === '-p' || arg === '--prompt') {
      prompt = args[++i] ?? ''
    } else if (arg.startsWith('-p=')) {
      prompt = arg.slice('-p='.length)
    } else if (arg === '--resume') {
      resumePath = args[++i]
    } else if (!arg.startsWith('-') && prompt.length === 0) {
      prompt = arg
    } else if (arg.startsWith('-')) {
      throw new Error(`unknown flag: ${arg}`)
    }

    i++
  }

  if (resumePath) {
    return { kind: 'resume', sessionPath: resumePath }
  }

  if (prompt.length > 0) {
    return { kind: 'prompt', prompt, model, permissionMode }
  }

  return { kind: 'repl', model, permissionMode }
}

export function renderHelp(): string {
  return `orchentra — AI-powered DevOps agent

USAGE
  orchentra [flags]                             Start interactive REPL
  orchentra -p <prompt> [flags]                 One-shot prompt
  orchentra init                                Scaffold project config
  orchentra investigate <owner>/<repo>#<run-id> Triage a failed workflow run
  orchentra triage <owner>/<repo>#<run-id>      Post triage as GitHub-native output
  orchentra fix <owner>/<repo>#<run-id>         Generate a fix and open a PR
  orchentra --version                           Print version

FLAGS
  -p, --prompt <text>                 One-shot prompt (non-interactive)
  -m, --model <model>                 Model to use (default: claude-sonnet-4-20250514)
      --permission-mode <mode>        Permission mode: read-only, workspace-write, danger-full-access
      --dangerously-skip-permissions  Shortcut for --permission-mode allow
      --resume <path>                 Resume a previous session
  -h, --help                          Show this help
  -V, --version                       Print version
`
}

function defaultModel(): string {
  return process.env.ORCHESTRA_MODEL ?? 'claude-sonnet-4-20250514'
}

function parseRepoRun(target: string): { owner: string; repo: string; runId: number } {
  const hashIdx = target.indexOf('#')
  if (hashIdx === -1) {
    throw new Error(`expected <owner>/<repo>#<run-id>, got: ${target}`)
  }
  const repoPart = target.slice(0, hashIdx)
  const runIdStr = target.slice(hashIdx + 1)
  const slashIdx = repoPart.indexOf('/')
  if (slashIdx === -1) {
    throw new Error(`expected <owner>/<repo>#<run-id>, got: ${target}`)
  }
  const owner = repoPart.slice(0, slashIdx)
  const repo = repoPart.slice(slashIdx + 1)
  const runId = parseInt(runIdStr, 10)
  if (!Number.isFinite(runId) || runId <= 0) {
    throw new Error(`invalid run-id: ${runIdStr}`)
  }
  return { owner, repo, runId }
}

function parseModelFlag(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--model' || args[i] === '-m') return args[i + 1]
    if (args[i]?.startsWith('--model=')) return args[i].slice('--model='.length)
  }
  return undefined
}

function parsePermissionFlag(args: string[]): PermissionMode | undefined {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dangerously-skip-permissions') return 'allow'
    if (args[i] === '--permission-mode') {
      const val = args[i + 1]
      if (val && VALID_PERMISSION_MODES.includes(val as PermissionMode)) {
        return val as PermissionMode
      }
    }
  }
  return undefined
}
