import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { saveCredential, writeProjectSettings } from '@orchentra/cli-api'
import { runInstallBootstrap } from '../auth/install-bootstrap'
import { startLoopback } from '../auth/loopback-server'

const DEFAULT_SERVER_URL = process.env.ORCHENTRA_SERVER_URL ?? 'http://localhost:3001'
const DEFAULT_APP_SLUG = 'orchentra'
const DEFAULT_TIMEOUT_MS = 5 * 60_000

export interface RunInitBootstrapOptions {
  readonly owner?: string
  readonly serverUrl?: string
}

function inferOwnerFromGit(cwd: string): string | null {
  const res = Bun.spawnSync(['git', 'remote', 'get-url', 'origin'], { cwd, stdout: 'pipe', stderr: 'pipe' })
  if (res.exitCode !== 0) return null
  const out = new TextDecoder().decode(res.stdout).trim()
  if (!out) return null
  const ssh = out.match(/git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/)
  if (ssh) return ssh[1]
  const https = out.match(/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/)
  if (https) return https[1]
  return null
}

async function openInBrowser(url: string): Promise<void> {
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

export async function runInitBootstrap(opts: RunInitBootstrapOptions): Promise<number> {
  const cwd = process.cwd()
  const owner = opts.owner ?? inferOwnerFromGit(cwd)
  if (!owner) {
    process.stderr.write('init: --owner required (no GitHub origin detected on this repo).\n')
    return 1
  }
  const serverUrl = opts.serverUrl ?? DEFAULT_SERVER_URL

  process.stdout.write(`Bootstrapping Orchentra for owner=${owner} via ${serverUrl}\n`)

  const result = await runInstallBootstrap({
    serverUrl,
    owner,
    appSlug: DEFAULT_APP_SLUG,
    cwd,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    randomState: () => randomBytes(24).toString('hex'),
    openBrowser: openInBrowser,
    makeLoopback: (o) => startLoopback({ timeoutMs: o.timeoutMs }),
    fetch,
    writeSettings: (input) => writeProjectSettings(input),
    saveApiKey: (apiKey) => saveCredential('orchentra', { apiKey }),
  })

  if (!result.ok) {
    process.stderr.write(`\nbootstrap failed: ${result.error}\n`)
    return 1
  }
  process.stdout.write(`\n\x1b[32m✓ Bootstrapped\x1b[0m  orgId=${result.orgId}  apiKey → ${result.credentialPath}\n`)
  process.stdout.write(`  settings → ${result.settingsPath}\n`)
  return 0
}
