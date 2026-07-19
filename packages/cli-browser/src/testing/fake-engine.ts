import { browserOpError, type ConsoleErrorEntry, type FailedRequestEntry } from '@orchentra/cli-core'
import type { BrowserEngine, EnginePage, GotoResult, LocatorDescriptor, RawA11yNode } from '../engine'

/**
 * Deterministic in-memory engine modelling a login fixture, for driving the full
 * 5-op flow with no Chromium. It behaves like a real page from the manager's
 * point of view: it exposes an a11y tree, mutates on fill/click, records console
 * errors + failed requests on bad credentials, and can be told to crash so the
 * bounded restart path is exercisable.
 */

export interface FakeEngineControls {
  /** How many pages the engine has created — proves a crash triggered a restart. */
  newPageCount(): number
  /** Arm the current page so its next act throws a crash and closes the page. */
  crashNextAction(): void
  /** Arm the current page so its next waitForStable raises a wait-timeout. */
  hangNextWait(): void
}

export interface FakeLoginOptions {
  validUser?: string
  validPass?: string
}

export function createFakeLoginEngine(options: FakeLoginOptions = {}): {
  engine: BrowserEngine
  controls: FakeEngineControls
} {
  const validUser = options.validUser ?? 'admin'
  const validPass = options.validPass ?? 'secret'
  let newPages = 0
  let armed = false
  let hang = false

  const engine: BrowserEngine = {
    async newPage(): Promise<EnginePage> {
      newPages++
      return new FakeLoginPage(
        validUser,
        validPass,
        () => armed,
        () => {
          armed = false
        },
        () => hang,
        () => {
          hang = false
        },
      )
    },
    async close(): Promise<void> {},
  }

  const controls: FakeEngineControls = {
    newPageCount: (): number => newPages,
    crashNextAction: (): void => {
      armed = true
    },
    hangNextWait: (): void => {
      hang = true
    },
  }

  return { engine, controls }
}

class FakeLoginPage implements EnginePage {
  private username = ''
  private password = ''
  private loggedIn = false
  private closed = false
  private url = 'about:blank'
  private readonly consoleErr: ConsoleErrorEntry[] = []
  private readonly failed: FailedRequestEntry[] = []

  constructor(
    private readonly validUser: string,
    private readonly validPass: string,
    private readonly isArmed: () => boolean,
    private readonly disarm: () => void,
    private readonly isHung: () => boolean,
    private readonly clearHang: () => void,
  ) {}

  async goto(url: string): Promise<GotoResult> {
    this.url = url
    // Fresh document on navigation.
    this.username = ''
    this.password = ''
    this.loggedIn = false
    return { url, status: 200, title: this.pageTitle() }
  }

  currentUrl(): string {
    return this.url
  }

  async title(): Promise<string> {
    return this.pageTitle()
  }

  async waitForStable(): Promise<void> {
    if (this.isHung()) {
      this.clearHang()
      throw browserOpError('wait-timeout', 'fake page never settled')
    }
  }

  async a11ySnapshot(): Promise<RawA11yNode | null> {
    if (this.loggedIn) {
      return {
        role: 'RootWebArea',
        name: 'Dashboard',
        children: [
          { role: 'heading', name: `Welcome, ${this.username}` },
          { role: 'button', name: 'Log out' },
        ],
      }
    }
    return {
      role: 'RootWebArea',
      name: 'Sign in',
      children: [
        { role: 'heading', name: 'Sign in' },
        { role: 'textbox', name: 'Username', value: this.username },
        { role: 'textbox', name: 'Password', value: this.password },
        { role: 'button', name: 'Log in' },
      ],
    }
  }

  async click(loc: LocatorDescriptor): Promise<void> {
    this.guard()
    if (loc.role === 'button' && loc.name === 'Log in') return void this.submitLogin()
    if (loc.role === 'button' && loc.name === 'Log out') {
      this.loggedIn = false
      return
    }
    throw browserOpError('ref-not-found', `no ${loc.role} "${loc.name ?? ''}" to click`)
  }

  async fill(loc: LocatorDescriptor, text: string): Promise<void> {
    this.guard()
    if (loc.role === 'textbox' && loc.name === 'Username') {
      this.username = text
      return
    }
    if (loc.role === 'textbox' && loc.name === 'Password') {
      this.password = text
      return
    }
    throw browserOpError('ref-not-found', `no ${loc.role} "${loc.name ?? ''}" to fill`)
  }

  async selectOption(loc: LocatorDescriptor): Promise<void> {
    this.guard()
    throw browserOpError('ref-not-found', `no selectable ${loc.role} "${loc.name ?? ''}"`)
  }

  async submit(loc: LocatorDescriptor): Promise<void> {
    this.guard()
    if (loc.role === 'button' || loc.role === 'textbox') return void this.submitLogin()
    throw browserOpError('ref-not-found', `cannot submit ${loc.role}`)
  }

  async screenshot(): Promise<{ bytes: number; data: string }> {
    this.guard()
    // A real 1x1 PNG so downstream image handling sees a valid payload.
    return {
      bytes: 1024,
      data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    }
  }

  consoleErrors(): ConsoleErrorEntry[] {
    return this.consoleErr
  }

  failedRequests(): FailedRequestEntry[] {
    return this.failed
  }

  isClosed(): boolean {
    return this.closed
  }

  async close(): Promise<void> {
    this.closed = true
  }

  private pageTitle(): string {
    return this.loggedIn ? 'Dashboard' : 'Sign in'
  }

  private submitLogin(): void {
    if (this.username === this.validUser && this.password === this.validPass) {
      this.loggedIn = true
      return
    }
    this.consoleErr.push({ text: 'Invalid credentials', at: new Date().toISOString() })
    this.failed.push({ url: `${this.url}/api/login`, method: 'POST', status: 401, at: new Date().toISOString() })
  }

  private guard(): void {
    if (this.isArmed()) {
      this.disarm()
      this.closed = true
      throw browserOpError('crash', 'fake page crashed')
    }
    if (this.closed) throw browserOpError('crash', 'fake page is closed')
  }
}
