#!/usr/bin/env bun
/**
 * `npx @orchentra/install-mcp` — one-shot helper that prints (or writes) the
 * MCP server config snippet that Claude Desktop / Cursor expect.
 *
 * Phase 1B: scaffold only. Real publish + a richer interactive flow ship in
 * Phase 1C. Intentionally tiny so it can run inside `npx` without
 * dependencies.
 */
import { buildMcpServerConfig, renderConfigSnippet, writeConfigFile, type BuildOptions } from './config'

interface ParsedArgs {
  url: string
  orgId: string
  token?: string
  write?: string
  overwrite?: boolean
  help?: boolean
}

const HELP = `orchentra install-mcp — print or write the Orchentra MCP server config

Usage:
  npx @orchentra/install-mcp --url <url> --org <orgId> [--token <token>] [--write <path>] [--overwrite]

Options:
  --url <url>          Hosted MCP HTTP endpoint (required)
  --org <orgId>        Org id sent on x-orchentra-org (required)
  --token <token>      Bearer token; omit to add later in your client UI
  --write <path>       Write config JSON to <path> instead of stdout
  --overwrite          When --write is set, allow replacing an existing file
  -h, --help           Show this help text
`

export function parseArgs(argv: string[]): ParsedArgs {
  const args: Partial<ParsedArgs> = {}
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    switch (a) {
      case '-h':
      case '--help':
        args.help = true
        break
      case '--url':
        args.url = argv[++i]
        break
      case '--org':
      case '--org-id':
        args.orgId = argv[++i]
        break
      case '--token':
        args.token = argv[++i]
        break
      case '--write':
        args.write = argv[++i]
        break
      case '--overwrite':
        args.overwrite = true
        break
      default:
        // Unknown flag — surface to the user but don't crash; help below
        // will explain available options.
        process.stderr.write(`unknown argument: ${a}\n`)
    }
  }
  return args as ParsedArgs
}

export async function run(argv: string[], stdout: { write: (s: string) => unknown }): Promise<number> {
  const args = parseArgs(argv)
  if (args.help) {
    stdout.write(HELP)
    return 0
  }
  if (!args.url || !args.orgId) {
    stdout.write(HELP)
    process.stderr.write('\nerror: --url and --org are required\n')
    return 2
  }

  const buildOpts: BuildOptions = { url: args.url, orgId: args.orgId }
  if (args.token !== undefined) buildOpts.token = args.token
  const cfg = buildMcpServerConfig(buildOpts)

  if (args.write) {
    const path = writeConfigFile(args.write, cfg, { overwrite: args.overwrite === true })
    stdout.write(`wrote ${path}\n`)
    return 0
  }

  stdout.write(renderConfigSnippet(cfg) + '\n')
  return 0
}

// Allow `bun run src/main.ts` and `npx`-style entry. The check guards against
// accidental side effects when the module is imported in tests.
if (import.meta.main) {
  void run(process.argv.slice(2), process.stdout).then((code) => {
    if (code !== 0) process.exit(code)
  })
}
