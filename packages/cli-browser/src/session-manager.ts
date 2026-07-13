import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  browserOpError,
  isBrowserOpError,
  type BrowserActParams,
  type BrowserActResult,
  type BrowserDiagnostics,
  type BrowserNavigateParams,
  type BrowserNavigateResult,
  type BrowserRunSession,
  type BrowserScreenshotParams,
  type BrowserScreenshotResult,
  type BrowserSnapshot,
} from '@orchentra/cli-core'
import { assignRefs } from './a11y'
import type { BrowserEngine, EngineLoader, EnginePage, LocatorDescriptor } from './engine'
import { loadPlaywrightEngine } from './playwright-engine'

export interface BrowserSessionManagerOptions {
  /** Run workspace; artifacts (screenshots) default under `<cwd>/.orchentra/artifacts`. */
  readonly cwd: string
  /** Injectable engine loader; defaults to lazy Playwright/Chromium. */
  readonly loadEngine?: EngineLoader
  readonly headless?: boolean
  readonly artifactDir?: string
  /** How many times a crashed session may restart before the op surfaces `crash`. */
  readonly maxRestarts?: number
  readonly defaultTimeoutMs?: number
}

/**
 * The run-scoped browser session (singleton per run, owned by SharedToolState).
 *
 * It stays browser-free until the first navigate: constructing it only stores a
 * loader reference. The first navigate loads the engine (the lazy-install
 * trigger), and the session then persists across turns until `shutdown()` at run
 * end. A mid-op crash triggers a bounded restart + re-observe rather than killing
 * the run. Refs come from the latest a11y snapshot; acting on a ref that is not
 * in the current snapshot re-observes and remaps exactly once (R6).
 */
export class BrowserSessionManager implements BrowserRunSession {
  private readonly cwd: string
  private readonly loadEngine: EngineLoader
  private readonly artifactDir: string
  private readonly maxRestarts: number
  private readonly defaultTimeoutMs: number

  private engine?: BrowserEngine
  private page?: EnginePage
  private refs = new Map<string, LocatorDescriptor>()
  private consoleSeen = 0
  private requestsSeen = 0
  private lastUrl?: string
  private restarts = 0

  constructor(options: BrowserSessionManagerOptions) {
    this.cwd = options.cwd
    this.loadEngine =
      options.loadEngine ?? ((): Promise<BrowserEngine> => loadPlaywrightEngine({ headless: options.headless ?? true }))
    this.artifactDir = options.artifactDir ?? join(options.cwd, '.orchentra', 'artifacts')
    this.maxRestarts = options.maxRestarts ?? 1
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 15_000
  }

  async navigate(params: BrowserNavigateParams): Promise<BrowserNavigateResult> {
    const page = await this.ensurePage()
    const result = await page.goto(params.url, params.timeoutMs ?? this.defaultTimeoutMs)
    this.lastUrl = result.url || params.url
    // New document — every prior ref is stale.
    this.refs.clear()
    return { url: result.url, title: result.title, status: result.status }
  }

  async snapshot(): Promise<BrowserSnapshot> {
    const page = this.requirePage()
    const raw = await page.a11ySnapshot()
    const { tree, registry } = assignRefs(raw)
    this.refs = registry

    const errors = page.consoleErrors()
    const requests = page.failedRequests()
    const newConsoleErrors = errors.slice(this.consoleSeen)
    const newFailedRequests = requests.slice(this.requestsSeen)
    this.consoleSeen = errors.length
    this.requestsSeen = requests.length

    return { url: page.currentUrl(), title: await page.title(), tree, newConsoleErrors, newFailedRequests }
  }

  async act(params: BrowserActParams): Promise<BrowserActResult> {
    this.requirePage()
    try {
      await this.performOnce(params)
      return { action: params.action, ref: params.ref, remapped: false }
    } catch (err) {
      if (isBrowserOpError(err) && err.kind === 'crash') {
        await this.recoverFromCrash()
        await this.performOnce(params)
        return { action: params.action, ref: params.ref, remapped: true }
      }
      if (isBrowserOpError(err) && err.kind === 'ref-not-found') {
        // Re-observe and remap once; a second miss propagates as a tool error.
        await this.snapshot()
        await this.performOnce(params)
        return { action: params.action, ref: params.ref, remapped: true }
      }
      throw err
    }
  }

  async screenshot(params: BrowserScreenshotParams): Promise<BrowserScreenshotResult> {
    const page = this.requirePage()
    const path = params.path ?? join(this.artifactDir, `screenshot-${Date.now()}.png`)
    await mkdir(dirname(path), { recursive: true })
    const bytes = await page.screenshot({ fullPage: params.fullPage ?? false, path })
    return { path, bytes }
  }

  async close(): Promise<void> {
    await this.closeEngine()
    this.lastUrl = undefined
    this.restarts = 0
  }

  async shutdown(): Promise<void> {
    await this.close()
  }

  diagnostics(): BrowserDiagnostics {
    if (!this.page) return { consoleErrors: [], failedRequests: [] }
    return { consoleErrors: this.page.consoleErrors(), failedRequests: this.page.failedRequests() }
  }

  private async performOnce(params: BrowserActParams): Promise<void> {
    const page = this.requirePage()
    const loc = this.refs.get(params.ref)
    if (!loc) throw browserOpError('ref-not-found', `ref ${params.ref} is not in the current snapshot`)
    const timeout = params.timeoutMs ?? this.defaultTimeoutMs
    switch (params.action) {
      case 'click':
        return page.click(loc, timeout)
      case 'type':
        return page.fill(loc, params.text ?? '', timeout)
      case 'select':
        return page.selectOption(loc, params.value ?? params.text ?? '', timeout)
      case 'submit':
        return page.submit(loc, timeout)
      default:
        throw browserOpError('nav-error', `unsupported action ${String(params.action)}`)
    }
  }

  private async ensurePage(): Promise<EnginePage> {
    if (this.page && !this.page.isClosed()) return this.page
    if (!this.engine) this.engine = await this.loadEngine()
    this.page = await this.engine.newPage()
    // Fresh page — reset both the ref registry and the delta baselines.
    this.refs.clear()
    this.consoleSeen = 0
    this.requestsSeen = 0
    return this.page
  }

  private requirePage(): EnginePage {
    if (!this.page || this.page.isClosed()) {
      throw browserOpError('not-initialized', 'no live browser page — call browser_navigate first')
    }
    return this.page
  }

  private async recoverFromCrash(): Promise<void> {
    if (this.restarts >= this.maxRestarts) {
      throw browserOpError('crash', `browser crashed and the restart budget (${this.maxRestarts}) is exhausted`)
    }
    this.restarts++
    await this.closeEngine()
    const page = await this.ensurePage()
    if (this.lastUrl) {
      const result = await page.goto(this.lastUrl, this.defaultTimeoutMs)
      this.lastUrl = result.url || this.lastUrl
    }
    // Re-observe so refs are valid against the restarted page.
    await this.snapshot()
  }

  private async closeEngine(): Promise<void> {
    try {
      await this.page?.close()
    } catch {
      // already gone
    }
    try {
      await this.engine?.close()
    } catch {
      // already gone
    }
    this.page = undefined
    this.engine = undefined
    this.refs.clear()
    this.consoleSeen = 0
    this.requestsSeen = 0
  }
}
