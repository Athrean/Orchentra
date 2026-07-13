import {
  SNAPSHOT_CONTENT_MARKER,
  isBrowserOpError,
  renderA11yTree,
  type BrowserActionKind,
  type BrowserRunSession,
  type ToolContext,
  type ToolDefinition,
  type ToolEvidence,
  type ToolResult,
} from '@orchentra/cli-core'

/**
 * The browser verification op family (M2). Each op drives the run-scoped
 * `BrowserRunSession` on `ctx.sharedState.browser`; the concrete session lives in
 * the isolated `@orchentra/cli-browser` package and loads Playwright lazily, so
 * these tools carry no browser dependency themselves. Observations are a11y trees
 * with stable refs only — the full DOM never reaches model context — and failures
 * are surfaced already carrying console-error + failed-request evidence (tenet 5).
 */

function requireSession(ctx: ToolContext): BrowserRunSession | undefined {
  return ctx.sharedState?.browser
}

function unavailable(): ToolResult {
  return { content: 'browser session is not available in this context', isError: true }
}

/** Console errors + failed requests recorded so far, for attaching to any result. */
function diagnosticsEvidence(session: BrowserRunSession): ToolEvidence[] {
  const diag = session.diagnostics()
  if (diag.consoleErrors.length === 0 && diag.failedRequests.length === 0) return []
  return [
    {
      kind: 'browser-diagnostics',
      summary: `${diag.consoleErrors.length} console error(s), ${diag.failedRequests.length} failed request(s)`,
      detail: diag,
    },
  ]
}

/** Model-facing console/network summary — the failing result carries it so the model never has to ask (tenet 5). */
function formatDiagnostics(session: BrowserRunSession): string {
  const diag = session.diagnostics()
  const parts: string[] = []
  if (diag.consoleErrors.length > 0) {
    parts.push(
      `\nconsole errors (${diag.consoleErrors.length}):\n` +
        diag.consoleErrors
          .slice(-5)
          .map((e) => `  - ${e.text}`)
          .join('\n'),
    )
  }
  if (diag.failedRequests.length > 0) {
    parts.push(
      `\nfailed requests (${diag.failedRequests.length}):\n` +
        diag.failedRequests
          .slice(-5)
          .map((r) => `  - ${r.method} ${r.url}${r.status ? ` [${r.status}]` : ''}`)
          .join('\n'),
    )
  }
  return parts.join('')
}

function errorResult(session: BrowserRunSession, err: unknown): ToolResult {
  const kind = isBrowserOpError(err) ? err.kind : 'error'
  const message = err instanceof Error ? err.message : String(err)
  const diag = session.diagnostics()
  return {
    content: `browser ${kind}: ${message}${formatDiagnostics(session)}`,
    isError: true,
    data: { failureKind: kind, consoleErrors: diag.consoleErrors, failedRequests: diag.failedRequests },
    evidence: [
      { kind: 'browser-failure', summary: `browser op failed (${kind})`, detail: { kind, message } },
      ...diagnosticsEvidence(session),
    ],
  }
}

interface NavigateInput {
  url?: string
  backgroundProcessId?: string
  timeoutMs?: number
}

export const browserNavigateTool: ToolDefinition = {
  name: 'browser_navigate',
  description:
    'Open a URL in the run browser (readiness-waited). Pass a literal url, or backgroundProcessId to reuse the dev-server URL a run_in_background bash op discovered.',
  level: 'admin',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string' },
      backgroundProcessId: { type: 'string' },
      timeoutMs: { type: 'integer', minimum: 1 },
    },
    additionalProperties: false,
  },
  async execute(args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const session = requireSession(ctx)
    if (!session) return unavailable()
    const input = args as NavigateInput

    let url = input.url
    if (!url && input.backgroundProcessId) {
      url = ctx.sharedState?.processSupervisor?.get(input.backgroundProcessId)?.url
      if (!url) {
        return {
          content: `no URL known for background process ${input.backgroundProcessId} — is it ready?`,
          isError: true,
        }
      }
    }
    if (!url) return { content: 'browser_navigate requires url or backgroundProcessId', isError: true }

    try {
      const result = await session.navigate({ url, timeoutMs: input.timeoutMs })
      const title = result.title ? ` — ${result.title}` : ''
      const status = result.status !== undefined ? ` [${result.status}]` : ''
      return {
        content: `navigated to ${result.url}${status}${title}`,
        isError: false,
        data: result,
        evidence: [{ kind: 'browser-navigation', summary: `navigated to ${result.url}`, detail: result }],
      }
    } catch (err) {
      return errorResult(session, err)
    }
  },
}

export const browserSnapshotTool: ToolDefinition = {
  name: 'browser_snapshot',
  description:
    'Observe the current page as an accessibility tree with stable refs, plus console-error and failed-request deltas since the last snapshot. Act on refs from this tree.',
  level: 'read',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async execute(_args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const session = requireSession(ctx)
    if (!session) return unavailable()
    try {
      const snap = await session.snapshot()
      // Lead with the supersession marker so the runtime evicts older snapshots
      // (only the latest a11y tree stays live in context — MVP exit #3).
      const header = `${SNAPSHOT_CONTENT_MARKER} url: ${snap.url}${snap.title ? `  title: ${snap.title}` : ''}`
      const body = renderA11yTree(snap.tree)
      const errLines =
        snap.newConsoleErrors.length > 0
          ? `\n\nconsole errors since last snapshot (${snap.newConsoleErrors.length}):\n` +
            snap.newConsoleErrors.map((e) => `  - ${e.text}`).join('\n')
          : ''
      const reqLines =
        snap.newFailedRequests.length > 0
          ? `\n\nfailed requests since last snapshot (${snap.newFailedRequests.length}):\n` +
            snap.newFailedRequests.map((r) => `  - ${r.method} ${r.url}${r.status ? ` [${r.status}]` : ''}`).join('\n')
          : ''
      return {
        content: `${header}\n${body}${errLines}${reqLines}`,
        isError: false,
        data: snap,
        evidence: [
          {
            kind: 'browser-snapshot',
            summary: `a11y snapshot: ${countNodes(snap.tree)} node(s), ${snap.newConsoleErrors.length} new console error(s), ${snap.newFailedRequests.length} new failed request(s)`,
            detail: {
              url: snap.url,
              newConsoleErrors: snap.newConsoleErrors,
              newFailedRequests: snap.newFailedRequests,
            },
          },
        ],
      }
    } catch (err) {
      return errorResult(session, err)
    }
  },
}

interface ActInput {
  ref?: string
  action?: BrowserActionKind
  text?: string
  value?: string
  timeoutMs?: number
}

export const browserActTool: ToolDefinition = {
  name: 'browser_act',
  description:
    'Interact with a ref from the latest snapshot: click, type (text), select (value), or submit. A stale ref is re-observed and remapped once before the op fails.',
  level: 'admin',
  inputSchema: {
    type: 'object',
    properties: {
      ref: { type: 'string' },
      action: { type: 'string', enum: ['click', 'type', 'select', 'submit'] },
      text: { type: 'string' },
      value: { type: 'string' },
      timeoutMs: { type: 'integer', minimum: 1 },
    },
    required: ['ref', 'action'],
    additionalProperties: false,
  },
  async execute(args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const session = requireSession(ctx)
    if (!session) return unavailable()
    const input = args as ActInput
    try {
      const result = await session.act({
        ref: input.ref!,
        action: input.action!,
        text: input.text,
        value: input.value,
        timeoutMs: input.timeoutMs,
      })
      const note = result.remapped ? ' (ref remapped)' : ''
      return {
        content: `${result.action} on ${result.ref}${note}`,
        isError: false,
        data: result,
        evidence: [{ kind: 'browser-action', summary: `${result.action} on ${result.ref}`, detail: result }],
      }
    } catch (err) {
      return errorResult(session, err)
    }
  },
}

interface ScreenshotInput {
  fullPage?: boolean
  path?: string
}

export const browserScreenshotTool: ToolDefinition = {
  name: 'browser_screenshot',
  description: 'Capture a screenshot of the current page as an artifact (use at an assertion point or on failure).',
  level: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      fullPage: { type: 'boolean' },
      path: { type: 'string' },
    },
    additionalProperties: false,
  },
  async execute(args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const session = requireSession(ctx)
    if (!session) return unavailable()
    const input = args as ScreenshotInput
    try {
      const result = await session.screenshot({ fullPage: input.fullPage, path: input.path })
      return {
        content: `screenshot saved to ${result.path} (${result.bytes} bytes)`,
        isError: false,
        data: result,
        artifacts: [{ uri: result.path, kind: 'file', action: 'created' }],
        evidence: [{ kind: 'browser-screenshot', summary: `screenshot: ${result.path}`, detail: result }],
      }
    } catch (err) {
      return errorResult(session, err)
    }
  },
}

export const browserCloseTool: ToolDefinition = {
  name: 'browser_close',
  description: 'Close the run browser session. Also fired automatically at run end.',
  level: 'read',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async execute(_args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const session = requireSession(ctx)
    if (!session) return { content: 'no browser session to close', isError: false }
    try {
      await session.close()
      return { content: 'browser session closed', isError: false, data: { closed: true } }
    } catch (err) {
      return errorResult(session, err)
    }
  },
}

export const browserTools: ToolDefinition[] = [
  browserNavigateTool,
  browserSnapshotTool,
  browserActTool,
  browserScreenshotTool,
  browserCloseTool,
]

function countNodes(nodes: { children?: unknown[] }[]): number {
  let total = 0
  for (const node of nodes) {
    total += 1
    const children = (node as { children?: { children?: unknown[] }[] }).children
    if (children && children.length > 0) total += countNodes(children)
  }
  return total
}
