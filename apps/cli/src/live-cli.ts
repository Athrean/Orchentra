import type {
  ChatMessage,
  ConversationConfig,
  ConversationDeps,
  MemoryFeatureConfig,
  PermissionMode,
  Provider,
  RuntimeEvent,
  SessionControl,
  SessionWriter,
  SharedToolState,
  SystemPrompt,
  ToolRegistry,
  UsageTotals,
} from '@orchentra/cli-core'
import {
  UsageTracker,
  compact,
  emptyUsage,
  buildSystemPrompt,
  ConversationRuntime,
  estimateMessagesTokens,
  defaultEstimator,
  prepareMemoryContext,
  PatternStore,
  embedText,
  createEnforcer,
  createPermissionStore,
} from '@orchentra/cli-core'
import type { AskUser as ToolAskUser, PermissionStore, PromptChoice as ToolPromptChoice } from '@orchentra/cli-core'
import {
  Spinner,
  renderToolCall,
  renderToolResult,
  renderDoneLine,
  renderErrorLine,
  renderCompactNotice,
} from './renderer'
import { readLine } from './input'
import { createHeadlessAskToolUser } from './headless-tool-prompt'

export type ModelResolver = (raw: string) => { model: string; provider: Provider; providerName: string }

export type RuntimeEventSink = (event: RuntimeEvent) => void
export type AskUserOverride = (prompt: string) => Promise<string>
export type AskToolUserOverride = ToolAskUser
export type NotifyDenyOverride = (info: { toolName: string; inputJson: string; reason: string }) => Promise<void>
export type { ToolPromptChoice }

export class LiveCli implements SessionControl {
  private model: string
  private permissionMode: PermissionMode
  private provider: Provider
  private readonly resolveModel: ModelResolver
  private readonly tools: ToolRegistry
  private readonly cwd: string
  private readonly sessionId: string
  private readonly tracker: UsageTracker
  private readonly spinner: Spinner
  private readonly sharedState: SharedToolState
  private readonly memoryConfig: MemoryFeatureConfig | null

  private messages: ChatMessage[] = []
  private session: SessionWriter | null = null
  private runtime: ConversationRuntime | null = null
  private forceCompactFlag = false
  private eventSink: RuntimeEventSink | null = null
  private askUserOverride: AskUserOverride | null = null
  private askToolUserOverride: AskToolUserOverride | null = null
  private notifyDenyOverride: NotifyDenyOverride | null = null
  private currentAbort: AbortController | null = null
  private readonly enforcer = createEnforcer()
  private readonly permissionStore: PermissionStore
  private startupNotices: string[] = []

  constructor(deps: {
    model: string
    permissionMode: PermissionMode
    provider: Provider
    resolveModel: ModelResolver
    tools: ToolRegistry
    cwd: string
    sessionId: string
    sharedState: SharedToolState
    memoryConfig?: MemoryFeatureConfig
  }) {
    this.model = deps.model
    this.permissionMode = deps.permissionMode
    this.provider = deps.provider
    this.resolveModel = deps.resolveModel
    this.tools = deps.tools
    this.cwd = deps.cwd
    this.sessionId = deps.sessionId
    this.sharedState = deps.sharedState
    this.memoryConfig = deps.memoryConfig ?? null
    this.tracker = new UsageTracker()
    this.spinner = new Spinner()
    this.permissionStore = createPermissionStore({
      cwd: this.cwd,
      onWarn: (m) => this.startupNotices.push(m),
    })
  }

  // SessionControl implementation
  getModel(): string {
    return this.model
  }

  setModel(newModel: string): string {
    const resolved = this.resolveModel(newModel)
    this.model = resolved.model
    this.provider = resolved.provider
    return resolved.model
  }

  getPermissionMode(): PermissionMode {
    return this.permissionMode
  }

  setPermissionMode(mode: PermissionMode): PermissionMode {
    this.permissionMode = mode
    return mode
  }

  setEventSink(sink: RuntimeEventSink | null): void {
    this.eventSink = sink
  }

  setAskUser(askUser: AskUserOverride | null): void {
    this.askUserOverride = askUser
  }

  setAskToolUser(askUser: AskToolUserOverride | null): void {
    this.askToolUserOverride = askUser
  }

  setNotifyDeny(notify: NotifyDenyOverride | null): void {
    this.notifyDenyOverride = notify
  }

  /**
   * Drain notices accumulated at construction time (e.g. malformed
   * permissions.json). Returns the notices and clears the buffer. Call
   * once at TUI mount or before the first headless turn so they surface
   * exactly once.
   */
  consumeStartupNotices(): readonly string[] {
    const out = this.startupNotices
    this.startupNotices = []
    return out
  }

  abort(): void {
    this.currentAbort?.abort()
  }

  isRunning(): boolean {
    return this.currentAbort !== null
  }

  getSessionId(): string {
    return this.sessionId
  }

  getTurns(): number {
    return this.tracker.turns()
  }

  getUsage(): UsageTotals {
    return this.tracker.cumulativeUsage()
  }

  clearHistory(): void {
    this.messages = []
  }

  forceCompact(): void {
    this.forceCompactFlag = true
  }

  // Legacy getters (backward compat)
  get currentModel(): string {
    return this.model
  }

  get currentPermissionMode(): PermissionMode {
    return this.permissionMode
  }

  get turns(): number {
    return this.tracker.turns()
  }

  get cumulativeUsage(): UsageTotals {
    return this.tracker.cumulativeUsage()
  }

  setSession(writer: SessionWriter): void {
    this.session = writer
  }

  async runTurn(input: string): Promise<void> {
    const sink = this.eventSink
    // Handle forced compaction
    if (this.forceCompactFlag) {
      this.forceCompactFlag = false
      const est = estimateMessagesTokens(this.messages, defaultEstimator)
      if (est > 0) {
        const result = compact({
          messages: this.messages,
          contextWindowTokens: 200_000,
          thresholdRatio: 0,
          keepRecent: 6,
        })
        if (result.compacted) {
          this.messages = result.messages
          if (sink) {
            sink({
              kind: 'compacted',
              droppedMessageCount: result.droppedCount,
              tokensSaved: result.tokensSaved,
              summary: '',
            })
          } else {
            process.stdout.write(renderCompactNotice(result.droppedCount, result.tokensSaved) + '\n')
          }
        }
      }
    }

    if (!sink) this.spinner.start('Thinking...')

    // Build dynamic prompt parts (memory context)
    const dynamicParts: string[] = []
    if (this.sharedState.planMode) {
      dynamicParts.push(
        'PLANNING MODE ACTIVE: Do not execute any tools. Only reason and plan. The user will call exit_plan_mode when ready to execute.',
      )
    }
    if (this.memoryConfig?.enabled) {
      try {
        const memCtx = await prepareMemoryContext(
          {
            store: new PatternStore(),
            embed: embedText,
            config: this.memoryConfig,
          },
          'default',
          input,
        )
        if (memCtx.text) dynamicParts.push(memCtx.text)
      } catch {
        // Gracefully degrade if memory/embedding is unavailable
      }
    }

    const config: ConversationConfig = {
      model: this.model,
      maxOutputTokens: 4096,
      contextWindowTokens: 200_000,
      compactionThreshold: 0.8,
      keepRecentOnCompact: 6,
      budget: { maxSteps: 50, maxTokens: 200_000 },
      sessionId: this.sessionId,
      cwd: this.cwd,
    }

    const systemPrompt: SystemPrompt = buildSystemPrompt({
      staticParts: [
        "You are Orchentra, a DevOps engineer's daily co-pilot. " +
          'Help with code, CI failures, GitHub issues/PRs, and ops tasks. ' +
          'When asked about GitHub issues, pull requests, or pasted github.com URLs, ' +
          'always use github_list_issues, github_get_issue, github_list_pulls, github_get_pull, ' +
          'or github_search_issues. Never use web_fetch on github.com — it returns raw HTML and ' +
          'fails on private repos. Pass repos as "owner/repo" or the full URL; the tools parse both.',
      ],
      dynamicParts,
    })

    const askUser = async (prompt: string): Promise<string> => {
      if (this.askUserOverride) return this.askUserOverride(prompt)
      this.spinner.stop()
      process.stdout.write(`\n${prompt}\n`)
      const outcome = await readLine('> ')
      if (!sink) this.spinner.start('Thinking...')
      return outcome.type === 'submit' ? outcome.text : ''
    }

    const headlessAsk = createHeadlessAskToolUser({
      isTty: () => Boolean(process.stdin.isTTY),
      writePrompt: (text) => process.stdout.write(text),
      writeNotice: (text) => process.stderr.write(`\n${text}\n`),
      readLineRaw: async () => {
        const outcome = await readLine('')
        return outcome.type === 'submit' ? outcome.text : null
      },
    })

    const askToolUser: ToolAskUser = async (request) => {
      if (this.askToolUserOverride) return this.askToolUserOverride(request)
      this.spinner.stop()
      const choice = await headlessAsk(request)
      if (!sink) this.spinner.start('Thinking...')
      return choice
    }

    this.currentAbort = new AbortController()
    const deps: ConversationDeps = {
      provider: this.provider,
      tools: this.tools,
      systemPrompt,
      sharedState: this.sharedState,
      askUser,
      enforcer: this.enforcer,
      enforcerAskUser: askToolUser,
      enforcerStore: this.permissionStore,
      enforcerNotifyDeny: async (info) => {
        if (this.notifyDenyOverride) return this.notifyDenyOverride(info)
        process.stderr.write(`\nBlocked ${info.toolName}: ${info.reason}\n`)
      },
      permissionMode: this.permissionMode,
      signal: this.currentAbort.signal,
    }

    this.runtime = new ConversationRuntime(config, deps)

    let steps = 0
    let lastUsage: UsageTotals = emptyUsage()

    try {
      for await (const event of this.runtime.run({ userMessage: input, priorMessages: this.messages })) {
        await this.handleEvent(event)
        if (event.kind === 'usage') {
          lastUsage = event.cumulative
          this.tracker.record(event.turn)
        }
        if (event.kind === 'done') {
          steps = event.steps
          lastUsage = event.usage
        }
      }

      // Capture the full conversation state (user + assistant + tool messages)
      // so the next turn sees assistant/tool context, not just user prompts.
      this.messages = this.runtime.getFinalMessages()
      if (sink) {
        sink({ kind: 'done', reason: 'stop', steps, usage: lastUsage })
      } else {
        this.spinner.stop()
        process.stdout.write(renderDoneLine(steps, lastUsage, this.model) + '\n')
      }
    } catch (err) {
      const message = formatThrown(err)
      if (sink) {
        sink({ kind: 'error', message, retryable: false })
      } else {
        this.spinner.stop()
        process.stdout.write(renderErrorLine(message) + '\n')
      }
    } finally {
      this.currentAbort = null
    }
  }

  private async handleEvent(event: RuntimeEvent): Promise<void> {
    if (this.eventSink) {
      this.eventSink(event)
    } else {
      switch (event.kind) {
        case 'text':
          process.stdout.write(event.delta)
          break
        case 'tool_use':
          process.stdout.write('\n' + renderToolCall(event.call.name, event.call.input) + '\n')
          break
        case 'tool_result':
          process.stdout.write(renderToolResult(event.result.content, event.result.isError) + '\n')
          break
        case 'compacted':
          process.stdout.write(renderCompactNotice(event.droppedMessageCount, event.tokensSaved) + '\n')
          break
        case 'error':
          if (!event.retryable) {
            process.stdout.write(renderErrorLine(event.message) + '\n')
          }
          break
      }
    }

    if (this.session) {
      await this.session.append(event)
    }
  }

  async persistSession(): Promise<void> {
    if (this.session) {
      await this.session.close()
    }
  }
}

// Defensive stringifier for unknown thrown values. Plain `String(err)` on an
// object literal produces "[object Object]" — useless to the user. Errors with
// a `.message` field surface that; otherwise we fall back to JSON.
function formatThrown(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message
    if (typeof m === 'string' && m.length > 0) return m
  }
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}
