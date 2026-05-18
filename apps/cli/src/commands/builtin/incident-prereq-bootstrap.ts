/**
 * Slice 5: production bootstrap hook for the /incident prereq middleware.
 *
 * The hook surfaces `Bootstrap now? [Y/n]` over a node:readline prompt and
 * delegates the actual install dance to the same orchestrator the `/init`
 * slash command uses. The orchestrator + the prompter are isolated here
 * so the middleware (and its tests) stay free of side-effectful imports.
 */

import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { saveCredential, writeProjectSettings } from '@orchentra/cli-api'
import { runInstallBootstrap } from '../../auth/install-bootstrap'
import { startLoopback } from '../../auth/loopback-server'
import { inferGitHubOwner } from '../../util/git-owner'
import type { CommandContext } from '../registry'
import type { IncidentBootstrapHook } from './incident-prereq'

const APP_SLUG = 'orchentra'
const DEFAULT_SERVER_URL = process.env.ORCHENTRA_SERVER_URL ?? 'http://localhost:3001'
const DEFAULT_TIMEOUT_MS = 5 * 60_000

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

async function defaultPromptYesNo(prompt: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const ans = (await rl.question(prompt)).trim().toLowerCase()
    return ans === '' || ans.startsWith('y')
  } catch {
    return false
  } finally {
    rl.close()
  }
}

/**
 * Production wiring: ask Y/n via stdin, then run the same orchestrator
 * the `/init` slash drives. On no inferrable owner the prompt resolves
 * to `false` so the legacy tabular menu still renders.
 */
export const defaultIncidentBootstrapHook: IncidentBootstrapHook = {
  async promptBootstrap(ctx: CommandContext): Promise<boolean> {
    if (!inferGitHubOwner(ctx.cwd)) return false
    return defaultPromptYesNo('  Bootstrap GH App now? [Y/n] ')
  },
  async runBootstrap(ctx: CommandContext): Promise<void> {
    const owner = inferGitHubOwner(ctx.cwd)?.owner
    if (!owner) return
    const result = await runInstallBootstrap({
      serverUrl: DEFAULT_SERVER_URL,
      owner,
      appSlug: APP_SLUG,
      cwd: ctx.cwd,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      randomState: () => randomBytes(24).toString('hex'),
      openBrowser: defaultOpenBrowser,
      makeLoopback: (o) => startLoopback({ timeoutMs: o.timeoutMs }),
      fetch,
      writeSettings: (i) => writeProjectSettings(i),
      saveApiKey: (apiKey) => saveCredential('orchentra', { apiKey }),
    })
    if (!result.ok) {
      process.stderr.write(`  bootstrap failed: ${result.error}\n`)
    }
  },
}
