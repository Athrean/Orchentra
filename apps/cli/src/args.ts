import type { PermissionMode } from '@orchentra/cli-core'
import { knownOpIds } from './op-commands/run-op-verb'

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
  | { kind: 'investigate'; spec: string; model: string; permissionMode: PermissionMode }
  | { kind: 'triage'; spec: string; model: string; permissionMode: PermissionMode }
  | {
      kind: 'fix'
      spec: string
      model: string
      permissionMode: PermissionMode
      title?: string
      base?: string
      autoMerge: boolean
    }
  | { kind: 'doctor' }
  | { kind: 'watch'; repo: string; intervalMs?: number }
  | { kind: 'mcp'; sub: 'list' }
  | { kind: 'mcp'; sub: 'test'; name: string }
  | { kind: 'mcp'; sub: 'serve'; printToolsJson: boolean }
  | { kind: 'login'; provider?: string; apiKey?: string }
  | { kind: 'logout'; provider: string }
  | { kind: 'reauth' }
  | { kind: 'auth-status' }
  | { kind: 'graph'; executionId: string; outputFormat: 'tree' | 'json' }
  | { kind: 'why'; nodeId: string; outputFormat: 'tree' | 'json' }
  | { kind: 'op'; opId: string; argv: string[] }

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

  if (first === 'investigate' || first === 'triage' || first === 'fix') {
    return parseSubcommandArgs(first, args.slice(1))
  }

  if (first === 'session') {
    return parseSessionArgs(args.slice(1))
  }

  if (first === 'doctor') {
    return { kind: 'doctor' }
  }

  if (first === 'watch') {
    return parseWatchArgs(args.slice(1))
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

  if (first === 'graph') {
    const executionId = args[1]
    if (!executionId) throw new Error('graph: missing <executionId>')
    const outputFormat = parseOutputFormat('graph', args.slice(2))
    return { kind: 'graph', executionId, outputFormat }
  }

  if (first === 'why') {
    const nodeId = args[1]
    if (!nodeId) throw new Error('why: missing <nodeId>')
    const outputFormat = parseOutputFormat('why', args.slice(2))
    return { kind: 'why', nodeId, outputFormat }
  }

  // Op-verb dispatch: any op id from the operations registry routes through
  // the op-command factory. Set is computed once at module load.
  if (knownOpIds().has(first)) {
    return { kind: 'op', opId: first, argv: args.slice(1) }
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
  orchentra [flags]                       Start interactive REPL
  orchentra -p <prompt> [flags]           One-shot prompt
  orchentra init                          Scaffold project config
  orchentra investigate <owner/repo#id>   Triage a failing workflow run
  orchentra triage <owner/repo#id>        Post triage output as GitHub check/comment
  orchentra fix <owner/repo#id> [flags]   Produce a code-fix PR for a failing run
  orchentra session replay <id|latest>    Replay a recorded session as JSONL events
  orchentra doctor                        Check auth, provider, and workspace health
  orchentra watch <owner/repo>            Watch a repo for failing workflows and triage them
  orchentra graph <executionId> [--output-format tree|json]
                                          Render the execution graph (tree default; --json for raw DTO)
  orchentra mcp list                       List configured MCP servers + connection status
  orchentra mcp test <name>                Connect to one MCP server and print its tools
  orchentra mcp serve [--print-tools-json] Start the stdio MCP server (or print tool schemas)
  orchentra login <provider> [--api-key]   Sign in (anthropic|gemini|github|openai|xai|dashscope)
  orchentra logout <provider>             Remove stored credentials for a provider
  orchentra reauth                        Re-run the first-run LLM provider setup
  orchentra whoami                        Show signed-in providers and credential sources
  orchentra why <nodeId> [--output-format tree|json]
                                          Trace a node's ancestors + inputs (tree default; --json for raw DTO)
  orchentra --version                     Print version

FLAGS
  -p, --prompt <text>                 One-shot prompt (non-interactive)
  -m, --model <model>                 Model to use (default: claude-sonnet-4-20250514)
      --permission-mode <mode>        Permission mode: read-only, workspace-write, danger-full-access
      --dangerously-skip-permissions  Shortcut for --permission-mode allow
      --resume <path>                 Resume a previous session
      --base <branch>                 Base branch for fix PRs (default: main)
      --title <text>                  PR title override for fix
      --auto-merge                    After /fix PR opens, poll CI; surface failures (default: off)
  -h, --help                          Show this help
  -V, --version                       Print version
`
}

function defaultModel(): string {
  return process.env.ORCHESTRA_MODEL ?? 'claude-sonnet-4-20250514'
}

function parseSubcommandArgs(sub: 'investigate' | 'triage' | 'fix', rest: string[]): CliAction {
  let spec: string | undefined
  let model = defaultModel()
  let permissionMode: PermissionMode = 'workspace-write'
  let title: string | undefined
  let base: string | undefined
  let autoMerge = false

  let i = 0
  while (i < rest.length) {
    const arg = rest[i]
    if (arg === '--model' || arg === '-m') {
      model = readSubcommandFlagValue(rest, ++i, arg, sub)
    } else if (arg === '--permission-mode') {
      const val = readSubcommandFlagValue(rest, ++i, arg, sub)
      if (!val || !VALID_PERMISSION_MODES.includes(val as PermissionMode)) {
        throw new Error(`invalid permission mode: ${val}`)
      }
      permissionMode = val as PermissionMode
    } else if (arg === '--dangerously-skip-permissions') {
      permissionMode = 'allow'
    } else if (arg === '--title') {
      title = readSubcommandFlagValue(rest, ++i, arg, sub)
    } else if (arg === '--base') {
      base = readSubcommandFlagValue(rest, ++i, arg, sub)
    } else if (arg === '--auto-merge') {
      if (sub !== 'fix') throw new Error(`${sub}: unknown flag: --auto-merge`)
      autoMerge = true
    } else if (!arg.startsWith('-') && spec === undefined) {
      spec = arg
    } else if (arg.startsWith('-')) {
      throw new Error(`unknown flag for ${sub}: ${arg}`)
    }
    i++
  }

  if (!spec) throw new Error(`${sub}: missing <owner/repo#run-id>`)

  if (sub === 'fix') return { kind: 'fix', spec, model, permissionMode, title, base, autoMerge }
  if (sub === 'triage') return { kind: 'triage', spec, model, permissionMode }
  return { kind: 'investigate', spec, model, permissionMode }
}

function readSubcommandFlagValue(
  rest: string[],
  index: number,
  flag: string,
  sub: 'investigate' | 'triage' | 'fix',
): string {
  const value = rest[index]
  if (!value || value.startsWith('-')) {
    throw new Error(`${sub}: ${flag} requires a value`)
  }
  return value
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
  if (sub === 'serve') {
    let printToolsJson = false
    for (let i = 1; i < rest.length; i++) {
      const arg = rest[i]
      if (arg === '--print-tools-json') {
        printToolsJson = true
      } else {
        throw new Error(`mcp serve: unknown flag: ${arg}`)
      }
    }
    return { kind: 'mcp', sub: 'serve', printToolsJson }
  }
  throw new Error(`mcp: unknown subcommand '${sub}'. expected 'list', 'test <name>', or 'serve'`)
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

function parseOutputFormat(verb: 'graph' | 'why', rest: string[]): 'tree' | 'json' {
  let format: 'tree' | 'json' = 'tree'
  let i = 0
  while (i < rest.length) {
    const arg = rest[i]
    if (arg === '--json') {
      format = 'json'
    } else if (arg === '--output-format') {
      const val = rest[++i]
      if (val !== 'tree' && val !== 'json') {
        throw new Error(`${verb}: invalid --output-format value: ${val ?? ''}. valid: tree, json`)
      }
      format = val
    } else {
      throw new Error(`${verb}: unknown flag: ${arg}`)
    }
    i++
  }
  return format
}

function parseWatchArgs(rest: string[]): CliAction {
  let repo: string | undefined
  let intervalMs: number | undefined
  let i = 0
  while (i < rest.length) {
    const arg = rest[i]
    if (arg === '--interval') {
      const v = rest[++i]
      if (!v) throw new Error('watch: --interval requires a value (seconds)')
      const n = Number(v)
      if (!Number.isFinite(n) || n <= 0) throw new Error(`watch: invalid --interval value: ${v}`)
      intervalMs = Math.floor(n * 1000)
    } else if (!arg.startsWith('-') && repo === undefined) {
      repo = arg
    } else if (arg.startsWith('-')) {
      throw new Error(`watch: unknown flag: ${arg}`)
    }
    i++
  }
  if (!repo) throw new Error('watch: missing <owner/repo>')
  return intervalMs === undefined ? { kind: 'watch', repo } : { kind: 'watch', repo, intervalMs }
}
