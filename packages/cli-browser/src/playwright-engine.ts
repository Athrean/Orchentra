import { browserOpError, type ConsoleErrorEntry, type FailedRequestEntry } from '@orchentra/cli-core'
import type { BrowserEngine, EnginePage, GotoResult, LocatorDescriptor, RawA11yNode } from './engine'

/**
 * Playwright adapter. Playwright is imported through a variable specifier so it
 * never enters the static module graph: the core install stays browser-free (R2)
 * and `tsc` does not require the package to be present. The first browser op
 * calls `loadPlaywrightEngine`, which is the lazy-install trigger point — a
 * missing dependency surfaces as a classified `engine-unavailable` error with the
 * exact install command, not an opaque module-resolution crash.
 */

interface PwConsoleMessage {
  type(): string
  text(): string
}

interface PwRequestFailure {
  errorText: string
}

interface PwRequest {
  url(): string
  method(): string
  failure(): PwRequestFailure | null
}

interface PwResponse {
  url(): string
  status(): number
  request(): PwRequest
}

interface PwLocator {
  nth(index: number): PwLocator
  click(opts: { timeout: number }): Promise<void>
  fill(value: string, opts: { timeout: number }): Promise<void>
  selectOption(value: string, opts: { timeout: number }): Promise<void>
  press(key: string, opts: { timeout: number }): Promise<void>
  focus(opts: { timeout: number }): Promise<void>
}

interface PwAccessibility {
  snapshot(opts: { interestingOnly: boolean }): Promise<RawA11yNode | null>
}

interface PwPage {
  goto(url: string, opts: { timeout: number; waitUntil: string }): Promise<PwResponse | null>
  title(): Promise<string>
  url(): string
  accessibility: PwAccessibility
  getByRole(role: string, opts?: { name: string }): PwLocator
  screenshot(opts: { path: string; fullPage: boolean }): Promise<Uint8Array>
  waitForLoadState(state: string, opts: { timeout: number }): Promise<void>
  on(event: string, handler: (arg: unknown) => void): void
  isClosed(): boolean
  close(): Promise<void>
}

interface PwBrowser {
  newPage(): Promise<PwPage>
  close(): Promise<void>
}

interface PwBrowserType {
  launch(opts: { headless: boolean }): Promise<PwBrowser>
}

interface PlaywrightModule {
  chromium: PwBrowserType
}

export interface PlaywrightEngineOptions {
  readonly headless?: boolean
}

const INSTALL_HINT = 'bun add -D playwright && bunx playwright install chromium'

async function importPlaywright(): Promise<PlaywrightModule> {
  // Variable specifier: keeps Playwright out of the static graph so a core
  // install never pulls it and `tsc` never demands its types.
  const specifier = 'playwright'
  try {
    return (await import(specifier)) as unknown as PlaywrightModule
  } catch (err) {
    throw browserOpError(
      'engine-unavailable',
      `Playwright is not installed. Install it with:\n  ${INSTALL_HINT}\n(${(err as Error).message})`,
    )
  }
}

/** Lazy entry point: import Playwright, launch Chromium, wrap it as a BrowserEngine. */
export async function loadPlaywrightEngine(options: PlaywrightEngineOptions = {}): Promise<BrowserEngine> {
  const pw = await importPlaywright()
  const browser = await pw.chromium.launch({ headless: options.headless ?? true })
  return new PlaywrightEngine(browser)
}

class PlaywrightEngine implements BrowserEngine {
  constructor(private readonly browser: PwBrowser) {}

  async newPage(): Promise<EnginePage> {
    const page = await this.browser.newPage()
    return new PlaywrightPage(page)
  }

  async close(): Promise<void> {
    try {
      await this.browser.close()
    } catch {
      // already gone
    }
  }
}

class PlaywrightPage implements EnginePage {
  private readonly consoleErr: ConsoleErrorEntry[] = []
  private readonly failed: FailedRequestEntry[] = []

  constructor(private readonly page: PwPage) {
    this.attach()
  }

  private attach(): void {
    this.page.on('console', (arg) => {
      const msg = arg as PwConsoleMessage
      if (msg.type() === 'error') this.consoleErr.push({ text: msg.text(), at: now() })
    })
    this.page.on('pageerror', (arg) => {
      this.consoleErr.push({ text: (arg as Error).message ?? String(arg), at: now() })
    })
    this.page.on('requestfailed', (arg) => {
      const req = arg as PwRequest
      this.failed.push({ url: req.url(), method: req.method(), errorText: req.failure()?.errorText, at: now() })
    })
    this.page.on('response', (arg) => {
      const res = arg as PwResponse
      if (res.status() >= 400) {
        this.failed.push({ url: res.url(), method: res.request().method(), status: res.status(), at: now() })
      }
    })
  }

  async goto(url: string, timeoutMs: number): Promise<GotoResult> {
    return this.guard(async () => {
      const resp = await this.page.goto(url, { timeout: timeoutMs, waitUntil: 'domcontentloaded' })
      return { url: this.page.url(), status: resp?.status(), title: await this.page.title() }
    }, 'nav-error')
  }

  currentUrl(): string {
    return this.page.url()
  }

  title(): Promise<string> {
    return this.page.title()
  }

  waitForStable(timeoutMs: number): Promise<void> {
    // Deterministic settle in the executor; a genuine hang classifies as wait-timeout.
    return this.guard(() => this.page.waitForLoadState('networkidle', { timeout: timeoutMs }), 'nav-error')
  }

  a11ySnapshot(): Promise<RawA11yNode | null> {
    return this.page.accessibility.snapshot({ interestingOnly: true })
  }

  click(loc: LocatorDescriptor, timeoutMs: number): Promise<void> {
    return this.guard(() => this.locate(loc).click({ timeout: timeoutMs }), 'ref-not-found')
  }

  fill(loc: LocatorDescriptor, text: string, timeoutMs: number): Promise<void> {
    return this.guard(() => this.locate(loc).fill(text, { timeout: timeoutMs }), 'ref-not-found')
  }

  selectOption(loc: LocatorDescriptor, value: string, timeoutMs: number): Promise<void> {
    return this.guard(() => this.locate(loc).selectOption(value, { timeout: timeoutMs }), 'ref-not-found')
  }

  submit(loc: LocatorDescriptor, timeoutMs: number): Promise<void> {
    return this.guard(async () => {
      const target = this.locate(loc)
      await target.focus({ timeout: timeoutMs })
      await target.press('Enter', { timeout: timeoutMs })
    }, 'ref-not-found')
  }

  async screenshot(opts: { fullPage: boolean; path: string }): Promise<number> {
    const bytes = await this.page.screenshot({ path: opts.path, fullPage: opts.fullPage })
    return bytes.byteLength
  }

  consoleErrors(): ConsoleErrorEntry[] {
    return this.consoleErr
  }

  failedRequests(): FailedRequestEntry[] {
    return this.failed
  }

  isClosed(): boolean {
    return this.page.isClosed()
  }

  async close(): Promise<void> {
    try {
      await this.page.close()
    } catch {
      // already gone
    }
  }

  private locate(loc: LocatorDescriptor): PwLocator {
    const base = this.page.getByRole(loc.role, loc.name !== undefined ? { name: loc.name } : undefined)
    return base.nth(loc.nth)
  }

  private async guard<T>(fn: () => Promise<T>, fallbackKind: 'nav-error' | 'ref-not-found'): Promise<T> {
    try {
      return await fn()
    } catch (err) {
      const message = (err as Error).message ?? String(err)
      if (this.page.isClosed() || /target.*closed|browser has been closed|crash/i.test(message)) {
        throw browserOpError('crash', message)
      }
      if (/timeout.*exceeded|exceeded.*timeout/i.test(message)) {
        // A locate/action timeout usually means the element the ref pointed at is
        // no longer actionable — treat it like a ref miss so the manager remaps once.
        throw browserOpError(fallbackKind === 'ref-not-found' ? 'ref-not-found' : 'wait-timeout', message)
      }
      throw browserOpError(fallbackKind, message)
    }
  }
}

function now(): string {
  return new Date().toISOString()
}
