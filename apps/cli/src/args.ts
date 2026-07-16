import type { PermissionMode, RegressionCategory } from '@orchentra/cli-core'
import { getDefaultModel } from './session-config'
import { DEFAULT_MODEL_ID } from './model-catalog'

export type UpdateTag = 'alpha' | 'beta' | 'latest'

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
  | { kind: 'session-replay'; idOrLatest: string }
  | { kind: 'doctor' }
  | { kind: 'mcp'; sub: 'list' }
  | { kind: 'mcp'; sub: 'test'; name: string }
  | { kind: 'login'; provider?: string; apiKey?: string }
  | { kind: 'logout'; provider: string }
  | { kind: 'reauth' }
  | { kind: 'auth-status' }
  | { kind: 'update'; dryRun: boolean; tag: UpdateTag }
  | {
      kind: 'eval'
      corpus?: string
      id?: string
      model: string
      k?: number
      out?: string
      against?: string
      abProfiles?: boolean
    }
  | {
      kind: 'regressions'
      suite?: string
      id?: string
      category?: RegressionCategory
      k?: number
      out?: string
      summary?: string
      listCategories?: boolean
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
    if (args.length > 1) throw new Error(`init: unknown argument: ${args[1]}`)
    return { kind: 'init' }
  }

  if (first === 'update') {
    return parseUpdateArgs(args.slice(1))
  }

  if (first === 'session') {
    return parseSessionArgs(args.slice(1))
  }

  if (first === 'doctor') {
    return { kind: 'doctor' }
  }

  if (first === 'eval') {
    return parseEvalArgs(args.slice(1))
  }

  if (first === 'regressions') {
    return parseRegressionsArgs(args.slice(1))
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
  orchentra update [--tag <tag>]           Self-update from npm (alpha|beta|latest)
  orchentra eval [--corpus <dir>|--id <id>] Run the eval corpus → scoreboard JSON
  orchentra regressions [--id <id>]       Run the regression suite → report JSON (exit 1 on a blocker)
  orchentra --version                     Print version

FLAGS
  -p, --prompt <text>                 One-shot prompt (non-interactive)
  -m, --model <model>                 Model to use (overrides saved default)
      --permission-mode <mode>        Permission mode: read-only, workspace-write, danger-full-access
      --dangerously-skip-permissions  Shortcut for --permission-mode allow
      --resume <path>                 Resume a previous session
      --corpus <dir>                  eval: corpus directory (default evals/)
      --id <id>                       eval: run a single eval by id
      --k <n>                         eval/regressions: trials per entry (overrides meta.k)
      --out <path>                    eval/regressions: write the JSON to a file
      --against <bin>                 eval: second harness build → diff scoreboards
      --ab-profiles                   eval: A/B generic vs profiled model profiles → diff scoreboards
      --summary <path>                regressions: write the markdown quarantine/blocker summary
      --suite <dir>                   regressions: suite directory (default evals/regressions/)
      --category <c>                  regressions: run one shard only (harness|browser)
      --list-categories               regressions: print the suite's categories and exit
  -h, --help                          Show this help
  -V, --version                       Print version
`
}

function defaultModel(): string {
  return process.env.ORCHENTRA_MODEL ?? process.env.ORCHESTRA_MODEL ?? getDefaultModel() ?? DEFAULT_MODEL_ID
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

function parseUpdateArgs(rest: string[]): CliAction {
  let dryRun = false
  let tag: UpdateTag = 'latest'

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (arg === '--dry-run') {
      dryRun = true
      continue
    }
    if (arg === '--tag') {
      const value = rest[++i]
      if (!value) throw new Error('update: --tag requires a value')
      tag = parseUpdateTag(value)
      continue
    }
    if (arg.startsWith('--tag=')) {
      tag = parseUpdateTag(arg.slice('--tag='.length))
      continue
    }
    throw new Error(`update: unknown argument: ${arg}`)
  }

  return { kind: 'update', dryRun, tag }
}

function parseEvalArgs(rest: string[]): CliAction {
  let corpus: string | undefined
  let id: string | undefined
  let model = defaultModel()
  let k: number | undefined
  let out: string | undefined
  let against: string | undefined
  let abProfiles = false

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    const inline = (name: string): string | undefined =>
      arg.startsWith(`${name}=`) ? arg.slice(name.length + 1) : undefined

    if (arg === '--corpus') corpus = rest[++i]
    else if (inline('--corpus') !== undefined) corpus = inline('--corpus')
    else if (arg === '--id') id = rest[++i]
    else if (inline('--id') !== undefined) id = inline('--id')
    else if (arg === '-m' || arg === '--model') model = rest[++i] ?? model
    else if (inline('--model') !== undefined) model = inline('--model') as string
    else if (arg === '--k') k = parsePositiveInt('--k', rest[++i])
    else if (inline('--k') !== undefined) k = parsePositiveInt('--k', inline('--k'))
    else if (arg === '--out') out = rest[++i]
    else if (inline('--out') !== undefined) out = inline('--out')
    else if (arg === '--against') against = rest[++i]
    else if (inline('--against') !== undefined) against = inline('--against')
    else if (arg === '--ab-profiles') abProfiles = true
    else throw new Error(`eval: unknown argument: ${arg}`)
  }

  return { kind: 'eval', corpus, id, model, k, out, against, abProfiles }
}

const REGRESSION_CATEGORIES: RegressionCategory[] = ['harness', 'browser']

function parseRegressionsArgs(rest: string[]): CliAction {
  let suite: string | undefined
  let id: string | undefined
  let category: RegressionCategory | undefined
  let k: number | undefined
  let out: string | undefined
  let summary: string | undefined
  let listCategories = false

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    const inline = (name: string): string | undefined =>
      arg.startsWith(`${name}=`) ? arg.slice(name.length + 1) : undefined

    if (arg === '--suite') suite = rest[++i]
    else if (inline('--suite') !== undefined) suite = inline('--suite')
    else if (arg === '--id') id = rest[++i]
    else if (inline('--id') !== undefined) id = inline('--id')
    else if (arg === '--category') category = parseRegressionCategory(rest[++i])
    else if (inline('--category') !== undefined) category = parseRegressionCategory(inline('--category'))
    else if (arg === '--k') k = parsePositiveInt('--k', rest[++i])
    else if (inline('--k') !== undefined) k = parsePositiveInt('--k', inline('--k'))
    else if (arg === '--out') out = rest[++i]
    else if (inline('--out') !== undefined) out = inline('--out')
    else if (arg === '--summary') summary = rest[++i]
    else if (inline('--summary') !== undefined) summary = inline('--summary')
    else if (arg === '--list-categories') listCategories = true
    else throw new Error(`regressions: unknown argument: ${arg}`)
  }

  return { kind: 'regressions', suite, id, category, k, out, summary, listCategories }
}

function parseRegressionCategory(value: string | undefined): RegressionCategory {
  if (!value || !REGRESSION_CATEGORIES.includes(value as RegressionCategory)) {
    throw new Error(`regressions: invalid category: ${value ?? ''}. valid: ${REGRESSION_CATEGORIES.join(', ')}`)
  }
  return value as RegressionCategory
}

function parsePositiveInt(flag: string, value: string | undefined): number {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1) throw new Error(`${flag}: expected a positive integer, got '${value ?? ''}'`)
  return n
}

function parseUpdateTag(value: string): UpdateTag {
  if (value === 'alpha' || value === 'beta' || value === 'latest') return value
  throw new Error(`invalid update tag: ${value}. valid: alpha, beta, latest`)
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
