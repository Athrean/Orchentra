import type { PermissionMode } from '@orchentra/cli-core'
import { getDefaultModel } from './session-config'

export type CliAction =
  | { kind: 'version' }
  | { kind: 'help' }
  | { kind: 'init'; owner?: string; serverUrl?: string }
  | {
      kind: 'prompt'
      prompt: string
      model: string
      permissionMode: PermissionMode
    }
  | { kind: 'repl'; model: string; permissionMode: PermissionMode }
  | { kind: 'resume'; sessionPath: string }
  | { kind: 'session-replay'; idOrLatest: string }
  | { kind: 'doctor' }
  | { kind: 'mcp'; sub: 'list' }
  | { kind: 'mcp'; sub: 'test'; name: string }
  | { kind: 'login'; provider?: string; apiKey?: string }
  | { kind: 'logout'; provider: string }
  | { kind: 'reauth' }
  | { kind: 'auth-status' }

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
    return parseInitArgs(args.slice(1))
  }

  if (first === 'session') {
    return parseSessionArgs(args.slice(1))
  }

  if (first === 'doctor') {
    return { kind: 'doctor' }
  }

  if (first === 'mcp') {
    return parseMcpArgs(args.slice(1))
  }

  if (first === 'login') {
    return parseLoginArgs(args.slice(1))
  }

  if (first === 'logout') {
    const provider = args[1]
    if (!provider) throw new Error('logout: missing <provider>')
    return { kind: 'logout', provider }
  }

  if (first === 'reauth') {
    return { kind: 'reauth' }
  }

  if (first === 'whoami' || first === 'auth') {
    return { kind: 'auth-status' }
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
  return `orchentra — token-lean coding agent

USAGE
  orchentra [flags]                       Start interactive REPL
  orchentra -p <prompt> [flags]           One-shot prompt
  orchentra init                          Scaffold project config
  orchentra session replay <id|latest>    Replay a recorded session as JSONL events
  orchentra doctor                        Check auth, provider, and workspace health
  orchentra mcp list                      List configured MCP servers + connection status
  orchentra mcp test <name>               Connect to one MCP server and print its tools
  orchentra login <provider> [--api-key]  Sign in (anthropic|gemini|openai|xai|dashscope)
  orchentra logout <provider>             Remove stored credentials for a provider
  orchentra reauth                        Re-run the first-run LLM provider setup
  orchentra whoami                        Show signed-in providers and credential sources
  orchentra --version                     Print version

FLAGS
  -p, --prompt <text>                 One-shot prompt (non-interactive)
  -m, --model <model>                 Model to use (overrides saved default)
      --permission-mode <mode>        Permission mode: read-only, workspace-write, danger-full-access
      --dangerously-skip-permissions  Shortcut for --permission-mode allow
      --resume <path>                 Resume a previous session
  -h, --help                          Show this help
  -V, --version                       Print version
`
}

function defaultModel(): string {
  return process.env.ORCHENTRA_MODEL ?? process.env.ORCHESTRA_MODEL ?? getDefaultModel() ?? 'claude-sonnet-4-20250514'
}

function parseSessionArgs(rest: string[]): CliAction {
  const sub = rest[0]
  if (sub !== 'replay') {
    throw new Error(`session: unknown subcommand '${sub ?? ''}'. expected 'replay'`)
  }
  const idOrLatest = rest[1]
  if (!idOrLatest) {
    throw new Error('session replay: missing <id|latest>')
  }
  return { kind: 'session-replay', idOrLatest }
}

function parseMcpArgs(rest: string[]): CliAction {
  const sub = rest[0]
  if (sub === 'list' || sub === undefined) {
    return { kind: 'mcp', sub: 'list' }
  }
  if (sub === 'test') {
    const name = rest[1]
    if (!name) throw new Error('mcp test: missing <server-name>')
    return { kind: 'mcp', sub: 'test', name }
  }
  throw new Error(`mcp: unknown subcommand '${sub}'. expected 'list' or 'test <name>'`)
}

function parseInitArgs(rest: string[]): CliAction {
  let owner: string | undefined
  let serverUrl: string | undefined
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (arg.startsWith('--owner=')) {
      owner = arg.slice('--owner='.length)
      continue
    }
    if (arg === '--owner') {
      owner = rest[++i]
      if (!owner) throw new Error('init: --owner requires a value')
      continue
    }
    if (arg.startsWith('--server-url=')) {
      serverUrl = arg.slice('--server-url='.length)
      continue
    }
    if (arg === '--server-url') {
      serverUrl = rest[++i]
      if (!serverUrl) throw new Error('init: --server-url requires a value')
      continue
    }
    throw new Error(`init: unknown argument: ${arg}`)
  }
  return { kind: 'init', owner, serverUrl }
}

function parseLoginArgs(rest: string[]): CliAction {
  let provider: string | undefined
  let apiKey: string | undefined
  let i = 0
  while (i < rest.length) {
    const arg = rest[i]
    if (arg === '--api-key') {
      apiKey = rest[++i]
      if (!apiKey) throw new Error('login: --api-key requires a value')
    } else if (!arg.startsWith('-') && provider === undefined) {
      provider = arg
    } else if (arg.startsWith('-')) {
      throw new Error(`login: unknown flag: ${arg}`)
    }
    i++
  }
  if (!provider) return { kind: 'login' }
  return apiKey ? { kind: 'login', provider, apiKey } : { kind: 'login', provider }
}
