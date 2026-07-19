/**
 * Browser verification port — the run-scoped surface the browser ops call.
 *
 * The concrete implementation (`BrowserSessionManager`) lives in the isolated
 * `@orchentra/cli-browser` package so the heavyweight Playwright/Chromium
 * dependency never enters the core install graph (R2). These are pure types and
 * a structural interface: SharedToolState references the port, the host owns the
 * concrete session and tears it down at run end, and the browser ops observe
 * accessibility trees only — the full DOM never reaches model context.
 */

/** A single accessibility-tree node with a stable ref the model can act on. */
export interface A11yNode {
  /** Stable, content-derived ref; the same logical element keeps the same ref across snapshots. */
  readonly ref: string
  readonly role: string
  readonly name?: string
  readonly value?: string
  readonly checked?: boolean
  readonly disabled?: boolean
  readonly children?: A11yNode[]
}

export interface ConsoleErrorEntry {
  readonly text: string
  readonly at: string
}

export interface FailedRequestEntry {
  readonly url: string
  readonly method: string
  readonly status?: number
  readonly errorText?: string
  readonly at: string
}

/** Cumulative failure signals for attaching to a failing tool result (tenet 5). */
export interface BrowserDiagnostics {
  readonly consoleErrors: ConsoleErrorEntry[]
  readonly failedRequests: FailedRequestEntry[]
}

export interface BrowserSnapshot {
  readonly url: string
  readonly title?: string
  readonly tree: A11yNode[]
  /** Console errors observed since the previous snapshot. */
  readonly newConsoleErrors: ConsoleErrorEntry[]
  /** Failed network requests observed since the previous snapshot. */
  readonly newFailedRequests: FailedRequestEntry[]
}

export interface BrowserNavigateParams {
  /** Already-resolved URL (the tool resolves a ProcessSupervisor handle to this). */
  readonly url: string
  readonly timeoutMs?: number
}

export interface BrowserNavigateResult {
  readonly url: string
  readonly title?: string
  readonly status?: number
}

export type BrowserActionKind = 'click' | 'type' | 'select' | 'submit'

export interface BrowserActParams {
  readonly ref: string
  readonly action: BrowserActionKind
  /** Text to type for `type`. */
  readonly text?: string
  /** Option value for `select`. */
  readonly value?: string
  readonly timeoutMs?: number
}

export interface BrowserActResult {
  readonly action: BrowserActionKind
  readonly ref: string
  /** True when the ref had to be re-observed and remapped once before it resolved (R6). */
  readonly remapped: boolean
}

export interface BrowserScreenshotParams {
  readonly fullPage?: boolean
  /** Absolute path to write to; defaults to a run artifact path. */
  readonly path?: string
}

export interface BrowserScreenshotResult {
  readonly path: string
  readonly bytes: number
  /** Base64-encoded image bytes, for attaching as a visual content block. */
  readonly data: string
  /** IANA media type of the capture (PNG). */
  readonly mediaType: string
}

export type BrowserFailureKind =
  'ref-not-found' | 'wait-timeout' | 'crash' | 'nav-error' | 'engine-unavailable' | 'not-initialized'

export interface BrowserOpError extends Error {
  readonly kind: BrowserFailureKind
}

export function browserOpError(kind: BrowserFailureKind, message: string): BrowserOpError {
  const err = new Error(message) as Error & { kind: BrowserFailureKind }
  err.name = 'BrowserOpError'
  err.kind = kind
  return err
}

export function isBrowserOpError(value: unknown): value is BrowserOpError {
  return (
    value instanceof Error &&
    typeof (value as { kind?: unknown }).kind === 'string' &&
    (value as { name?: unknown }).name === 'BrowserOpError'
  )
}

/** Compact indented text rendering of an a11y tree — refs only, never raw DOM. */
export function renderA11yTree(nodes: A11yNode[], indent = 0): string {
  const lines: string[] = []
  for (const node of nodes) {
    const parts = [`${'  '.repeat(indent)}[${node.ref}] ${node.role}`]
    if (node.name) parts.push(`"${node.name}"`)
    if (node.value) parts.push(`= ${JSON.stringify(node.value)}`)
    if (node.checked) parts.push('(checked)')
    if (node.disabled) parts.push('(disabled)')
    lines.push(parts.join(' '))
    if (node.children && node.children.length > 0) lines.push(renderA11yTree(node.children, indent + 1))
  }
  return lines.join('\n')
}

/**
 * Run-scoped browser session. A singleton per run, owned by SharedToolState and
 * torn down via `shutdown()` at run end so no Chromium outlives the session.
 * Every method may throw a `BrowserOpError`; the ops classify and surface it.
 */
export interface BrowserRunSession {
  navigate(params: BrowserNavigateParams): Promise<BrowserNavigateResult>
  snapshot(): Promise<BrowserSnapshot>
  act(params: BrowserActParams): Promise<BrowserActResult>
  screenshot(params: BrowserScreenshotParams): Promise<BrowserScreenshotResult>
  /** Close the current page/browser but keep the session reusable. */
  close(): Promise<void>
  /** Terminate everything at run end — no zombie Chromium. */
  shutdown(): Promise<void>
  /** Cumulative console errors + failed requests, for attaching to a failing tool result. */
  diagnostics(): BrowserDiagnostics
}
