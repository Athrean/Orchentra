/**
 * Slice 4: `/init` slash command. Surfaces the same install bootstrap
 * orchestrator as `orchentra init` inside the REPL, so users don't need
 * to exit and re-launch the CLI to onboard.
 *
 * Renders a progress card via `ctx.ui` matching the `/incident` prereq
 * style — never raw stack traces. Side-effectful pieces (the orchestrator
 * itself, the owner-inference probe) are injected via the constructor so
 * tests can route through the registry without touching the network or
 * the filesystem.
 */

import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { saveCredential, writeProjectSettings } from '@orchentra/cli-api'
import { runInstallBootstrap, type BootstrapResult } from '../../auth/install-bootstrap'
import { startLoopback } from '../../auth/loopback-server'
import { inferGitHubOwner } from '../../util/git-owner'
import type { CommandContext, CommandHandler, SlashCommandSpec } from '../registry'
import type { UiCardSection, UiKVRow, UiSink } from '../ui-output'

const DEFAULT_APP_SLUG = 'orchentra'
const DEFAULT_SERVER_URL = process.env.ORCHENTRA_SERVER_URL ?? 'http://localhost:3001'
const DEFAULT_TIMEOUT_MS = 5 * 60_000

export interface SlashBootstrapInput {
  readonly owner: string
  readonly serverUrl?: string
  readonly cwd: string
  onProgress?(step: string): void
}

export type SlashBootstrapFn = (input: SlashBootstrapInput) => Promise<BootstrapResult>

export interface InitSlashDeps {
  readonly bootstrap?: SlashBootstrapFn
  readonly inferOwner?: (cwd: string) => string | null
}

interface ParsedArgs {
  readonly owner?: string
  readonly serverUrl?: string
}

function parseArgs(args: readonly string[]): ParsedArgs {
  let owner: string | undefined
  let serverUrl: string | undefined
  for (let i = 0; i < args.length; i++) {
    const tok = args[i]
    if (tok === '--owner' && i + 1 < args.length) owner = args[++i]
    else if (tok.startsWith('--owner=')) owner = tok.slice('--owner='.length)
    else if (tok === '--server' && i + 1 < args.length) serverUrl = args[++i]
    else if (tok.startsWith('--server=')) serverUrl = tok.slice('--server='.length)
  }
  return { owner: owner?.trim() || undefined, serverUrl: serverUrl?.trim() || undefined }
}

function progressCard(steps: readonly string[], titleSuffix: string): Extract<UiCardSection, object> {
  const rows: UiKVRow[] = steps.map((s, i) => ({ key: `step ${i + 1}`, value: s }))
  return { title: titleSuffix, rows }
}

function emitProgress(ui: UiSink | undefined, steps: readonly string[]): void {
  if (!ui) {
    process.stdout.write(`init: ${steps[steps.length - 1]}\n`)
    return
  }
  ui({
    kind: 'card',
    title: 'Bootstrapping Orchentra',
    sections: [progressCard(steps, 'progress')],
  })
}

function emitSuccess(
  ui: UiSink | undefined,
  steps: readonly string[],
  result: Extract<BootstrapResult, { ok: true }>,
): void {
  const rows: UiKVRow[] = [
    ...steps.map((s, i): UiKVRow => ({ key: `step ${i + 1}`, value: s })),
    { key: 'orgId', value: result.orgId },
    { key: 'installationId', value: String(result.installationId) },
    { key: 'settings', value: result.settingsPath },
    { key: 'credential', value: result.credentialPath },
  ]
  if (!ui) {
    process.stdout.write(`init: ✓ bootstrapped (orgId=${result.orgId})\n`)
    return
  }
  ui({
    kind: 'card',
    title: '✓ Bootstrapped',
    sections: [{ rows }],
  })
}

function emitFailure(ui: UiSink | undefined, steps: readonly string[], error: string): void {
  const rows: UiKVRow[] = [
    ...steps.map((s, i): UiKVRow => ({ key: `step ${i + 1}`, value: s })),
    { key: 'error', value: error },
  ]
  if (!ui) {
    process.stderr.write(`init: bootstrap failed: ${error}\n`)
    return
  }
  ui({
    kind: 'card',
    title: 'Bootstrap failed',
    sections: [{ rows }],
  })
}

async function defaultOpenBrowser(url: string): Promise<void> {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  await new Promise<void>((resolve) => {
    try {
      const child = spawn(cmd, process.platform === 'win32' ? ['', url] : [url], {
        stdio: 'ignore',
        detached: true,
        shell: process.platform === 'win32',
      })
      child.on('error', () => resolve())
      child.on('exit', () => resolve())
      child.unref()
      setTimeout(resolve, 500)
    } catch {
      resolve()
    }
  })
}

async function defaultPrompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise<string>((resolve) => {
    rl.question(`${question} `, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

function defaultPrintInstallUrl(url: string): void {
  process.stdout.write(`Could not open a browser. Open this URL manually:\n  ${url}\n`)
}

const productionBootstrap: SlashBootstrapFn = (input) =>
  runInstallBootstrap({
    serverUrl: input.serverUrl ?? DEFAULT_SERVER_URL,
    owner: input.owner,
    appSlug: DEFAULT_APP_SLUG,
    cwd: input.cwd,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    randomState: () => randomBytes(24).toString('hex'),
    openBrowser: defaultOpenBrowser,
    makeLoopback: (o) => startLoopback({ timeoutMs: o.timeoutMs }),
    fetch,
    writeSettings: (i) => writeProjectSettings(i),
    saveApiKey: (apiKey) => saveCredential('orchentra', { apiKey }),
    onProgress: input.onProgress,
    prompt: defaultPrompt,
    printInstallUrl: defaultPrintInstallUrl,
  })

export class InitSlashCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'init',
    aliases: [],
    summary: 'Bootstrap Orchentra for this repo (GitHub App install + apiKey)',
    argumentHint: '[--owner <login>] [--server <url>]',
  }

  private readonly bootstrap: SlashBootstrapFn
  private readonly inferOwner: (cwd: string) => string | null

  constructor(deps: InitSlashDeps = {}) {
    this.bootstrap = deps.bootstrap ?? productionBootstrap
    this.inferOwner = deps.inferOwner ?? ((cwd) => inferGitHubOwner(cwd)?.owner ?? null)
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const parsed = parseArgs(args)
    const owner = parsed.owner ?? this.inferOwner(ctx.cwd) ?? null
    if (!owner) {
      const msg = 'usage: /init --owner <login>  (no GitHub origin detected to infer from)'
      if (ctx.ui) ctx.ui({ kind: 'note', tone: 'warn', text: msg })
      else process.stderr.write(msg + '\n')
      return false
    }

    const steps: string[] = []
    const pushStep = (s: string): void => {
      steps.push(s)
      emitProgress(ctx.ui, steps)
    }

    let result: BootstrapResult
    try {
      result = await this.bootstrap({
        owner,
        serverUrl: parsed.serverUrl,
        cwd: ctx.cwd,
        onProgress: pushStep,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      emitFailure(ctx.ui, steps, msg)
      return false
    }

    if (!result.ok) {
      emitFailure(ctx.ui, steps, result.error)
      return false
    }

    steps.push('✓ bootstrapped')
    emitSuccess(ctx.ui, steps, result)
    return true
  }
}
