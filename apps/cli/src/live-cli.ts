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
} from '@orchentra/cli-core'
import {
  Spinner,
  renderToolCall,
  renderToolResult,
  renderDoneLine,
  renderErrorLine,
  renderCompactNotice,
} from './renderer'
import { readLine } from './input'

export class LiveCli implements SessionControl {
  private model: string
  private readonly permissionMode: PermissionMode
  private readonly provider: Provider
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

  constructor(deps: {
    model: string
    permissionMode: PermissionMode
    provider: Provider
    tools: ToolRegistry
    cwd: string
    sessionId: string
    sharedState: SharedToolState
    memoryConfig?: MemoryFeatureConfig
  }) {
    this.model = deps.model
    this.permissionMode = deps.permissionMode
    this.provider = deps.provider
    this.tools = deps.tools
    this.cwd = deps.cwd
    this.sessionId = deps.sessionId
    this.sharedState = deps.sharedState
    this.memoryConfig = deps.memoryConfig ?? null
    this.tracker = new UsageTracker()
    this.spinner = new Spinner()
  }

  // SessionControl implementation
  getModel(): string {
    return this.model
  }

  setModel(newModel: string): void {
    this.model = newModel
  }

  getPermissionMode(): PermissionMode {
    return this.permissionMode
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

  appendUserMessage(text: string): void {
    this.messages.push({ role: 'user', content: text })
  }

  async runTurn(input: string): Promise<void> {
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
          process.stdout.write(renderCompactNotice(result.droppedCount, result.tokensSaved) + '\n')
        }
      }
    }

    this.spinner.start('Thinking...')

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
      staticParts: ['You are a helpful coding assistant.'],
      dynamicParts,
    })

    const askUser = async (prompt: string): Promise<string> => {
      this.spinner.stop()
      process.stdout.write(`\n${prompt}\n`)
      const outcome = await readLine('> ')
      this.spinner.start('Thinking...')
      return outcome.type === 'submit' ? outcome.text : ''
    }

    const deps: ConversationDeps = {
      provider: this.provider,
      tools: this.tools,
      systemPrompt,
      sharedState: this.sharedState,
      askUser,
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

      this.appendUserMessage(input)
      this.spinner.stop()
      process.stdout.write(renderDoneLine(steps, lastUsage, this.model) + '\n')
    } catch (err) {
      this.spinner.stop()
      const message = err instanceof Error ? err.message : String(err)
      process.stdout.write(renderErrorLine(message) + '\n')
    }
  }

  private async handleEvent(event: RuntimeEvent): Promise<void> {
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
