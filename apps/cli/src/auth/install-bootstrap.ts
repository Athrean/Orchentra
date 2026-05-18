/**
 * Bootstrap orchestrator: registers a handoff with the Orchentra server,
 * spins up a loopback receiver, opens the GitHub App install URL in the
 * user's browser, awaits the callback, and persists the resulting
 * `{orgId, apiKey}` pair to project settings + the keychain.
 *
 * All side-effectful pieces are injected via `BootstrapDeps` so callers
 * (the shell verb, the `/init` slash, the first-run hook, the prereq
 * middleware) can share the same orchestration and tests can swap fakes.
 */

import type { LoopbackServer } from './loopback-server'

export interface BootstrapDeps {
  readonly serverUrl: string
  readonly owner: string
  readonly appSlug: string
  readonly cwd: string
  readonly timeoutMs: number
  randomState(): string
  openBrowser(url: string): Promise<void>
  makeLoopback(opts: { timeoutMs: number }): Promise<LoopbackServer>
  fetch: typeof fetch
  writeSettings(input: { cwd: string; orgId: string; serverUrl?: string }): string
  saveApiKey(apiKey: string): string
}

export type BootstrapResult =
  | {
      readonly ok: true
      readonly orgId: string
      readonly installationId: number
      readonly settingsPath: string
      readonly credentialPath: string
    }
  | {
      readonly ok: false
      readonly error: string
    }

async function startHandoff(
  deps: BootstrapDeps,
  state: string,
  redirectUri: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let res: Response
  try {
    res = await deps.fetch(`${deps.serverUrl}/api/install-handoff/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state, redirectUri }),
    })
  } catch (err) {
    return { ok: false, error: `server unreachable at ${deps.serverUrl}: ${(err as Error).message}` }
  }
  if (res.status === 200) return { ok: true }
  let body: { error?: string } | null = null
  try {
    body = (await res.json()) as { error?: string }
  } catch {
    body = null
  }
  return { ok: false, error: body?.error ?? `handoff start failed: HTTP ${res.status}` }
}

export async function runInstallBootstrap(deps: BootstrapDeps): Promise<BootstrapResult> {
  const state = deps.randomState()
  const loopback = await deps.makeLoopback({ timeoutMs: deps.timeoutMs })
  const redirectUri = `http://127.0.0.1:${loopback.port}/install-cb`

  try {
    const started = await startHandoff(deps, state, redirectUri)
    if (!started.ok) return { ok: false, error: started.error }

    const installUrl = `https://github.com/apps/${deps.appSlug}/installations/new?state=${state}`
    await deps.openBrowser(installUrl)

    let payload: Awaited<ReturnType<LoopbackServer['waitForCallback']>>
    try {
      payload = await loopback.waitForCallback()
    } catch (err) {
      return { ok: false, error: `loopback ${(err as Error).message}` }
    }

    if (payload.error) {
      return { ok: false, error: `callback error: ${payload.error}` }
    }
    if (!payload.orgId || !payload.apiKey || !payload.installationId) {
      return { ok: false, error: 'callback payload missing fields' }
    }

    const settingsPath = deps.writeSettings({ cwd: deps.cwd, orgId: payload.orgId, serverUrl: deps.serverUrl })
    const credentialPath = deps.saveApiKey(payload.apiKey)

    return {
      ok: true,
      orgId: payload.orgId,
      installationId: payload.installationId,
      settingsPath,
      credentialPath,
    }
  } finally {
    loopback.stop()
  }
}
