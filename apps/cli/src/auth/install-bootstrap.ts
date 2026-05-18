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
  /**
   * Optional progress callback. Fired at coarse-grained orchestration
   * milestones (probing existing install, registering handoff, awaiting
   * browser callback). The shell verb leaves this unset and prints its
   * own banner; the `/init` slash routes events into a UI card.
   */
  onProgress?(step: string): void
  /**
   * Optional interactive prompt. Returns the user's typed answer. Used by
   * the suspended-install branch to ask "Re-install to continue? [Y/n]"
   * before re-routing to the install/new flow. Tests inject a deterministic
   * answer; the shell verb wires this to stdin.
   */
  prompt?(question: string): Promise<string>
  /**
   * Optional fallback when `openBrowser` is unavailable on the host (e.g.
   * `xdg-open` not installed in a container). The orchestrator surfaces the
   * install URL via this callback so the user can copy it manually; the
   * loopback continues waiting for the callback.
   */
  printInstallUrl?(url: string): void
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

interface ExistingInstall {
  readonly installationId: number
  readonly suspendedAt: string | null
}

/**
 * Map of server-side callback error codes to user-readable messages. Codes
 * arrive in the `?error=<code>` query param the server adds when redirecting
 * back to the loopback. Anything not in this table falls through to a
 * pass-through preamble so the raw code is still visible.
 */
const CALLBACK_ERROR_MESSAGES: Record<string, string> = {
  app_credentials_unavailable:
    'server has no GitHub App credentials — contact your Orchentra admin',
  invalid_state: 'install link expired or stale — re-run `orchentra init`',
  state_in_use: 'install link already consumed — re-run `orchentra init`',
}

function describeCallbackError(code: string): string {
  return CALLBACK_ERROR_MESSAGES[code] ?? `callback error: ${code}`
}

async function probeByOwner(deps: BootstrapDeps): Promise<ExistingInstall | null> {
  try {
    const res = await deps.fetch(`${deps.serverUrl}/api/installations/by-owner/${deps.owner}`)
    if (res.status !== 200) return null
    const body = (await res.json()) as { installationId?: unknown; suspendedAt?: unknown }
    if (typeof body.installationId !== 'number') return null
    const suspendedAt = typeof body.suspendedAt === 'string' ? body.suspendedAt : null
    return { installationId: body.installationId, suspendedAt }
  } catch {
    return null
  }
}

function buildInstallUrl(deps: BootstrapDeps, state: string, existing: ExistingInstall | null): string {
  if (existing) {
    return `https://github.com/apps/${deps.appSlug}/installations/${existing.installationId}?state=${state}`
  }
  return `https://github.com/apps/${deps.appSlug}/installations/new?state=${state}`
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

function isAffirmative(answer: string): boolean {
  const trimmed = answer.trim().toLowerCase()
  // Default-Y prompt: empty / "y" / "yes" mean accept; anything else declines.
  return trimmed === '' || trimmed === 'y' || trimmed === 'yes'
}

export async function runInstallBootstrap(deps: BootstrapDeps): Promise<BootstrapResult> {
  const state = deps.randomState()
  deps.onProgress?.('probing install state…')
  let existing = await probeByOwner(deps)
  if (existing && existing.suspendedAt) {
    if (!deps.prompt) {
      return {
        ok: false,
        error: 'install is suspended and no prompt is available to confirm re-install',
      }
    }
    const answer = await deps.prompt('Install is suspended. Re-install to continue? [Y/n]')
    if (!isAffirmative(answer)) {
      return { ok: false, error: 'user declined to re-install (install is still suspended)' }
    }
    // Route to install/new — the existing record is rotated by the server
    // callback once the user completes the fresh install flow.
    existing = null
  }
  const loopback = await deps.makeLoopback({ timeoutMs: deps.timeoutMs })
  const redirectUri = `http://127.0.0.1:${loopback.port}/install-cb`

  try {
    const started = await startHandoff(deps, state, redirectUri)
    if (!started.ok) return { ok: false, error: started.error }

    const installUrl = buildInstallUrl(deps, state, existing)
    try {
      await deps.openBrowser(installUrl)
    } catch {
      // No `open` / `xdg-open` / `start` on this host. Surface the URL so
      // the user can open it manually; the loopback keeps waiting.
      if (deps.printInstallUrl) {
        deps.printInstallUrl(installUrl)
      } else {
        process.stdout.write(`Could not open a browser. Open this URL manually:\n  ${installUrl}\n`)
      }
    }

    deps.onProgress?.('waiting for browser…')
    let payload: Awaited<ReturnType<LoopbackServer['waitForCallback']>>
    try {
      payload = await loopback.waitForCallback()
    } catch (err) {
      return { ok: false, error: `loopback ${(err as Error).message}` }
    }

    if (payload.error) {
      return { ok: false, error: describeCallbackError(payload.error) }
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
