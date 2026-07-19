import { describe, expect, test } from 'bun:test'
import { toAnthropicMessages } from '@orchentra/cli-api'
import {
  ConversationRuntime,
  buildSystemPrompt,
  type ChatMessage,
  type ConversationConfig,
  type ConversationDeps,
  type Provider,
  type ProviderRequest,
  type ProviderStreamEvent,
  type ToolContext,
  type ToolRegistry,
  type BrowserRunSession,
  type BrowserActParams,
  type BrowserActResult,
  type BrowserDiagnostics,
  type BrowserNavigateParams,
  type BrowserNavigateResult,
  type BrowserScreenshotParams,
  type BrowserScreenshotResult,
  type BrowserSnapshot,
} from '@orchentra/cli-core'
import { browserScreenshotTool } from '../src/tools/browser-tools'

const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

// Minimal browser session returning a real PNG capture.
class FakeSession implements BrowserRunSession {
  async navigate(p: BrowserNavigateParams): Promise<BrowserNavigateResult> {
    return { url: p.url, title: 't', status: 200 }
  }
  async snapshot(): Promise<BrowserSnapshot> {
    return { url: 'u', title: 't', tree: [], newConsoleErrors: [], newFailedRequests: [] }
  }
  async act(p: BrowserActParams): Promise<BrowserActResult> {
    return { action: p.action, ref: p.ref, remapped: false }
  }
  async screenshot(p: BrowserScreenshotParams): Promise<BrowserScreenshotResult> {
    return { path: p.path ?? '/tmp/shot.png', bytes: 64, data: PNG_1X1, mediaType: 'image/png' }
  }
  async close(): Promise<void> {}
  async shutdown(): Promise<void> {}
  diagnostics(): BrowserDiagnostics {
    return { consoleErrors: [], failedRequests: [] }
  }
}

/** Provider that records every request it receives and replays scripted turns. */
function capturingProvider(turns: ProviderStreamEvent[][]): { provider: Provider; requests: ProviderRequest[] } {
  const requests: ProviderRequest[] = []
  let i = 0
  return {
    requests,
    provider: {
      async *stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
        requests.push(request)
        for (const ev of turns[i++] ?? []) yield ev
      },
    },
  }
}

function screenshotRegistry(session: BrowserRunSession): ToolRegistry {
  const toolCtx: ToolContext = {
    sessionId: 's',
    cwd: '/tmp',
    permissionMode: 'danger-full-access',
    sharedState: {
      taskStore: {
        create: () => ({}) as never,
        get: () => undefined,
        list: () => [],
        update: () => {},
        cancel: () => {},
      },
      todos: [],
      agentCounter: 0,
      planMode: false,
      browser: session,
    },
  }
  return {
    list: () => [{ name: 'browser_screenshot', description: 'shoot', inputSchema: {} }],
    has: (n) => n === 'browser_screenshot',
    execute: (_n, args) => browserScreenshotTool.execute(args, toolCtx),
  }
}

function makeConfig(): ConversationConfig {
  return {
    model: 'claude-fable-5',
    maxOutputTokens: 1024,
    contextWindowTokens: 100000,
    compactionThreshold: 0.7,
    keepRecentOnCompact: 4,
    budget: { maxSteps: 10, maxTokens: 100000 },
    sessionId: 'test-session',
    cwd: '/tmp',
  }
}

function makeDeps(provider: Provider, tools: ToolRegistry): ConversationDeps {
  return {
    provider,
    tools,
    systemPrompt: buildSystemPrompt({ staticParts: ['sys'], dynamicParts: [] }),
    persistToolOutput: async () => {},
    persistCompactionNote: async () => {},
    traceSink: { append: () => {}, finalize: () => {} },
  }
}

describe('screenshot → provider payload (end to end)', () => {
  test('a real screenshot reaches the next provider request and renders as an Anthropic image block', async () => {
    const { provider, requests } = capturingProvider([
      // Turn 1: the model calls browser_screenshot.
      [
        { kind: 'tool-use', call: { id: 'shot1', name: 'browser_screenshot', input: {} } },
        { kind: 'finish', stopReason: 'tool_use' },
      ],
      // Turn 2: the model wraps up (it has now "seen" the image).
      [
        { kind: 'text-delta', delta: 'looks aligned' },
        { kind: 'finish', stopReason: 'end_turn' },
      ],
    ])

    const rt = new ConversationRuntime(makeConfig(), makeDeps(provider, screenshotRegistry(new FakeSession())))
    for await (const ev of rt.run({ userMessage: 'screenshot the page' })) {
      expect(ev).toBeDefined()
    }

    // The second request carries the tool result — it must include the image.
    expect(requests.length).toBeGreaterThanOrEqual(2)
    const secondTurn = requests[1]!
    const toolMsg = secondTurn.messages.find((m: ChatMessage) => m.role === 'tool')
    expect(toolMsg?.images).toEqual([{ data: PNG_1X1, mediaType: 'image/png' }])

    // And the actual constructed Anthropic wire payload carries an image block.
    const wire = toAnthropicMessages(secondTurn.messages, secondTurn.model)
    const flat = JSON.stringify(wire)
    expect(flat).toContain('"type":"image"')
    expect(flat).toContain(PNG_1X1)
  })
})
