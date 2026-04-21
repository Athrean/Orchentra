import type {
  ChatMessage,
  ConversationConfig,
  ConversationDeps,
  PermissionMode,
  Provider,
  RuntimeEvent,
  SessionWriter,
  SystemPrompt,
  ToolRegistry,
  UsageTotals,
} from '@orchentra/cli-core'
import { UsageTracker, emptyUsage, buildSystemPrompt, ConversationRuntime } from '@orchentra/cli-core'
import {
  Spinner,
  renderToolCall,
  renderToolResult,
  renderDoneLine,
  renderErrorLine,
  renderCompactNotice,
} from './renderer'

export class LiveCli {
  private readonly model: string
  private readonly permissionMode: PermissionMode
  private readonly provider: Provider
  private readonly tools: ToolRegistry
  private readonly cwd: string
  private readonly sessionId: string
  private readonly tracker: UsageTracker
  private readonly spinner: Spinner

  private messages: ChatMessage[] = []
  private session: SessionWriter | null = null
  private runtime: ConversationRuntime | null = null

  constructor(deps: {
    model: string
    permissionMode: PermissionMode
    provider: Provider
    tools: ToolRegistry
    cwd: string
    sessionId: string
  }) {
    this.model = deps.model
    this.permissionMode = deps.permissionMode
    this.provider = deps.provider
    this.tools = deps.tools
    this.cwd = deps.cwd
    this.sessionId = deps.sessionId
    this.tracker = new UsageTracker()
    this.spinner = new Spinner()
  }

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

  clearHistory(): void {
    this.messages = []
  }

  async runTurn(input: string): Promise<void> {
    this.spinner.start('Thinking...')

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
      dynamicParts: [],
    })

    const deps: ConversationDeps = {
      provider: this.provider,
      tools: this.tools,
      systemPrompt,
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
