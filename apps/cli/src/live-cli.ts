import { randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import type {
  ChatMessage,
  ConversationConfig,
  ConversationDeps,
  AskUserHandler,
  AskUserRequest,
  DoneReason,
  HookRunner,
  EffortTier,
  TerseMode,
  PlanLevel,
  MemoryFeatureConfig,
  BudgetFeatureConfig,
  SpineBudgetControls,
  PermissionMode,
  Provider,
  ProviderRequest,
  ProviderStreamEvent,
  LlmSummarizer,
  RuntimeEvent,
  SessionControl,
  SessionForkResult,
  ContextFile,
  SessionGoal,
  SessionRecord,
  SessionResumeResult,
  SessionTaskSummary,
  RewindResult,
  RewindPreview,
  RewindFilePreview,
  SharedToolState,
  SystemPrompt,
  ToolCall,
  ToolRegistry,
  UndoFileEditResult,
  UndoFileEditsResult,
  UsageTotals,
  RunState,
} from '@orchentra/cli-core'
import {
  UsageTracker,
  collectContextFiles,
  emptyUsage,
  addUsage,
  buildSystemPrompt,
  ConversationRuntime,
  RuntimeBudget,
  estimateMessagesTokens,
  defaultEstimator,
  rewindBoundary,
  countUserTurns,
  lineDiffStats,
  groupToolSources,
  findDuplicateReads,
  prepareMemoryContext,
  captureMemoryFromTurn,
  spinePrompt,
  PatternStore,
  embedText,
  createEnforcer,
  createPermissionStore,
  loadPolicy,
  evaluate as evaluatePolicy,
  replaySession,
  SessionWriter,
  QuirkCounters,
  CompletionPolicy,
  restoreRunState,
} from '@orchentra/cli-core'
import type {
  AskUser as ToolAskUser,
  ContextBreakdown,
  PermissionStore,
  PolicyHandle,
  PolicyRule,
  PromptChoice as ToolPromptChoice,
  SpineSavings,
  StoredPermissionRule,
  TerseModeUsage,
} from '@orchentra/cli-core'
import { isMcpToolName, SubagentReplayExecutor, resolveSubagentRole, restrictRegistry } from '@orchentra/cli-tools'
import {
  Spinner,
  renderToolCall,
  renderToolResult,
  renderDoneLine,
  renderErrorLine,
  renderCompactNotice,
  renderToolOutputBudgeted,
  renderCostWarning,
  renderLoopDetected,
  renderMemorySaved,
} from './renderer'
import { readLine } from './input'
import { CLI_VERSION } from './version'
import { createHeadlessAskToolUser } from './headless-tool-prompt'
import { isProviderAuthError, friendlyAuthErrorMessage } from '@orchentra/cli-api'
import { thinkingTokenBudgetForEffort } from './provider-factory'

export type ModelResolver = (raw: string) => { model: string; provider: Provider; providerName: string }

/** Outcome of a single turn: `ok` only when the runtime finished with a clean stop. */
export interface TurnRunResult {
  readonly ok: boolean
  readonly reason: DoneReason
}

export interface TurnRunOptions {
  /** One-shot/autonomous path: completion needs executable evidence and a gate decision. */
  readonly verify?: boolean
  /** Explicit policy wins over the default one-shot policy. */
  readonly completionPolicy?: CompletionPolicy
  /** Continue a persisted autonomous objective after `/resume`. */
  readonly resume?: boolean
}

export type RuntimeEventSink = (event: RuntimeEvent) => void
export type AskUserOverride = AskUserHandler
export type AskToolUserOverride = ToolAskUser
export type NotifyDenyOverride = (info: { toolName: string; inputJson: string; reason: string }) => Promise<void>
export type NotifyPolicyOverride = (info: { kind: 'allow' | 'deny' | 'ask'; rule: PolicyRule }) => Promise<void>
export type { ToolPromptChoice }

interface FileUndoSnapshot {
  readonly path: string
  readonly existed: boolean
  readonly content: string
}

export class LiveCli implements SessionControl {
  private model: string
  private permissionMode: PermissionMode
  private effort: EffortTier
  private terseMode: TerseMode
  private planLevel: PlanLevel = 'plus'
  private provider: Provider
  private providerName: string
  /** Run-wide per-model deviation counters, surfaced in each trace manifest. */
  private readonly quirks = new QuirkCounters()
  private readonly resolveModel: ModelResolver
  private readonly tools: ToolRegistry
  private cwd: string
  private sessionId: string
  private tracker: UsageTracker
  private readonly spinner: Spinner
  private readonly sharedState: SharedToolState
  private readonly memoryConfig: MemoryFeatureConfig | null
  private budgetConfig: BudgetFeatureConfig | null
  private toolOutputBudgetChars = 50_000
  private compactionThreshold = 0.8
  private keepRecentOnCompact = 6
  private readonly hookRunner: HookRunner | null

  private messages: ChatMessage[] = []
  private session: SessionWriter | null = null
  private runtime: ConversationRuntime | null = null
  /** One budget per invocation: dollar spend accumulates across turns and sub-agent calls. */
  private runBudget: RuntimeBudget | null = null
  private forceCompactFlag = false
  private eventSink: RuntimeEventSink | null = null
  private askUserOverride: AskUserOverride | null = null
  private askToolUserOverride: AskToolUserOverride | null = null
  private notifyDenyOverride: NotifyDenyOverride | null = null
  private notifyPolicyOverride: NotifyPolicyOverride | null = null
  private readonly policyHandle: PolicyHandle
  private currentAbort: AbortController | null = null
  private readonly enforcer = createEnforcer()
  private readonly permissionStore: PermissionStore
  private startupNotices: string[] = []
  private goal: SessionGoal | null = null
  /** Last emitted autonomous checkpoint; session events restore this after interruption. */
  private runState: RunState | null = null
  private pendingFileUndoSnapshots = new Map<string, FileUndoSnapshot>()
  private currentTurnFileUndo: FileUndoSnapshot[] | null = null
  private lastTurnFileUndo: FileUndoSnapshot[] = []
  private readonly extraWorkspaceRoots = new Set<string>()

  constructor(deps: {
    model: string
    permissionMode: PermissionMode
    provider: Provider
    providerName?: string
    resolveModel: ModelResolver
    tools: ToolRegistry
    effort?: EffortTier
    terseMode?: TerseMode
    cwd: string
    sessionId: string
    sharedState: SharedToolState
    memoryConfig?: MemoryFeatureConfig
    budgetConfig?: BudgetFeatureConfig
    hookRunner?: HookRunner
  }) {
    this.model = deps.model
    this.permissionMode = deps.permissionMode
    this.effort = deps.effort ?? 'medium'
    this.terseMode = deps.terseMode ?? 'off'
    this.provider = deps.provider
    this.providerName = deps.providerName ?? 'unknown'
    this.resolveModel = deps.resolveModel
    this.tools = deps.tools
    this.cwd = deps.cwd
    this.sessionId = deps.sessionId
    this.sharedState = deps.sharedState
    this.memoryConfig = deps.memoryConfig ?? null
    this.budgetConfig = deps.budgetConfig ?? null
    this.hookRunner = deps.hookRunner ?? null
    this.tracker = new UsageTracker()
    this.spinner = new Spinner()
    this.permissionStore = createPermissionStore({
      cwd: this.cwd,
      onWarn: (m) => this.startupNotices.push(m),
    })
    this.policyHandle = loadPolicy(this.cwd, {
      watch: true,
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
    this.providerName = resolved.providerName
    return resolved.model
  }

  getPermissionMode(): PermissionMode {
    return this.permissionMode
  }

  setPermissionMode(mode: PermissionMode): PermissionMode {
    this.permissionMode = mode
    return mode
  }

  getEffort(): EffortTier {
    return this.effort
  }

  setEffort(effort: EffortTier): EffortTier {
    this.effort = effort
    return effort
  }

  getTerseMode(): TerseMode {
    return this.terseMode
  }

  setTerseMode(mode: TerseMode): TerseMode {
    this.terseMode = mode
    return mode
  }

  getPlanLevel(): PlanLevel {
    return this.planLevel
  }

  setPlanLevel(level: PlanLevel): PlanLevel {
    this.planLevel = level
    return level
  }

  getPlanMode(): boolean {
    return this.sharedState.planMode
  }

  setPlanMode(enabled: boolean): boolean {
    this.sharedState.planMode = enabled
    return enabled
  }

  setEventSink(sink: RuntimeEventSink | null): void {
    this.eventSink = sink
  }

  /**
   * Surface a repo-local hook's live progress to the UI. Emitted straight to
   * the event sink (not persisted) so a "running hook…" row can appear and
   * then resolve to pass/fail while the hook executes.
   */
  emitHookProgress(update: {
    id: string
    phase: 'running' | 'done'
    ok?: boolean
    event: 'pre_tool_use' | 'post_tool_use'
    tool: string
    command: string
  }): void {
    this.eventSink?.({
      kind: 'hook_progress',
      id: update.id,
      phase: update.phase,
      ok: update.ok,
      hookEvent: update.event,
      tool: update.tool,
      command: update.command,
    })
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

  setNotifyPolicy(notify: NotifyPolicyOverride | null): void {
    this.notifyPolicyOverride = notify
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

  getCwd(): string {
    return this.cwd
  }

  setCwd(cwd: string): string {
    this.cwd = cwd
    return this.cwd
  }

  getWorkspaceRoots(): readonly string[] {
    const primary = resolve(this.cwd)
    return [primary, ...Array.from(this.extraWorkspaceRoots).filter((root) => root !== primary)]
  }

  addWorkspaceRoot(path: string): readonly string[] {
    const root = resolve(path)
    if (root !== resolve(this.cwd)) this.extraWorkspaceRoots.add(root)
    return this.getWorkspaceRoots()
  }

  getTurns(): number {
    return this.tracker.turns()
  }

  getUsage(): UsageTotals {
    return this.tracker.cumulativeUsage()
  }

  getContextStats(): {
    messages: number
    estimatedTokens: number
    contextWindowTokens: number
    compactThresholdRatio: number
  } {
    return {
      messages: this.messages.length,
      estimatedTokens: estimateMessagesTokens(this.messages, defaultEstimator),
      contextWindowTokens: 200_000,
      compactThresholdRatio: this.compactionThreshold,
    }
  }

  listContextFiles(): readonly ContextFile[] {
    return collectContextFiles(this.messages)
  }

  getContextBreakdown(): ContextBreakdown {
    const serverOf = (name: string): string => (isMcpToolName(name) ? name.split('__')[1] : 'built-in')
    return {
      toolSources: groupToolSources(this.tools.list(), serverOf, defaultEstimator),
      duplicateReads: findDuplicateReads(this.messages),
    }
  }

  getGoal(): SessionGoal | null {
    return this.goal
  }

  setGoal(objective: string): SessionGoal {
    this.goal = { objective, createdAt: new Date().toISOString() }
    return this.goal
  }

  clearGoal(): void {
    this.goal = null
  }

  listTaskSummaries(): readonly SessionTaskSummary[] {
    return this.sharedState.taskStore.list().map((task) => ({
      id: task.taskId,
      status: task.status,
      prompt: task.prompt,
      output: task.output,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
    }))
  }

  cancelTask(id: string): boolean {
    const task = this.sharedState.taskStore.get(id)
    if (!task) return false
    this.sharedState.taskStore.cancel(id)
    return true
  }

  getTerseBreakdown(): readonly TerseModeUsage[] {
    return this.tracker.terseBreakdown()
  }

  getSavings(): SpineSavings {
    return this.tracker.savings()
  }

  getBudgetControls(): SpineBudgetControls {
    return {
      maxCostUsd: this.budgetConfig?.maxCostUsd,
      warnCostUsd: this.budgetConfig?.warnCostUsd,
      toolOutputBudgetChars: this.toolOutputBudgetChars,
      compactionThreshold: this.compactionThreshold,
      keepRecentOnCompact: this.keepRecentOnCompact,
    }
  }

  setBudgetControls(controls: Partial<SpineBudgetControls>): SpineBudgetControls {
    this.budgetConfig = {
      maxCostUsd: controls.maxCostUsd ?? this.budgetConfig?.maxCostUsd,
      warnCostUsd: controls.warnCostUsd ?? this.budgetConfig?.warnCostUsd,
    }
    if ('maxCostUsd' in controls && controls.maxCostUsd === undefined) this.budgetConfig.maxCostUsd = undefined
    if ('warnCostUsd' in controls && controls.warnCostUsd === undefined) this.budgetConfig.warnCostUsd = undefined
    if (controls.toolOutputBudgetChars !== undefined) this.toolOutputBudgetChars = controls.toolOutputBudgetChars
    if (controls.compactionThreshold !== undefined) this.compactionThreshold = controls.compactionThreshold
    if (controls.keepRecentOnCompact !== undefined) this.keepRecentOnCompact = controls.keepRecentOnCompact
    return this.getBudgetControls()
  }

  getCostLimits(): { maxCostUsd?: number; warnCostUsd?: number } {
    return {
      maxCostUsd: this.budgetConfig?.maxCostUsd,
      warnCostUsd: this.budgetConfig?.warnCostUsd,
    }
  }

  listPermissionRules(): readonly PolicyRule[] {
    return this.policyHandle.ruleset.rules.slice()
  }

  listStoredPermissionRules(): readonly StoredPermissionRule[] {
    return this.permissionStore.list()
  }

  clearHistory(): void {
    this.messages = []
    this.runState = null
    this.pendingFileUndoSnapshots.clear()
    this.currentTurnFileUndo = null
    this.lastTurnFileUndo = []
  }

  async startNewSession(): Promise<void> {
    this.clearHistory()
    this.runtime = null
    // A fresh session drops conversation-scoped state so the footer's cost /
    // context readouts and the injected goal start from zero — mirroring the
    // tracker reset that resumeSession already performs. User preferences
    // (model, permission mode, effort, terse mode) intentionally survive.
    this.tracker = new UsageTracker()
    this.goal = null
    this.runState = null
    // Per-conversation scratch state resets too. Background tasks (taskStore)
    // and the user-toggled plan mode deliberately survive, matching how
    // preferences and running work outlive /clear in Claude Code.
    this.sharedState.todos = []
    this.sharedState.agentCounter = 0
    const current = this.session
    if (!current) {
      this.sessionId = randomUUID()
      return
    }
    const rootDir = dirname(current.path)
    await current.close()
    const id = randomUUID()
    const next = await SessionWriter.open({
      rootDir,
      id,
      meta: { cwd: this.cwd, model: this.model },
    })
    this.sessionId = id
    this.session = next
  }

  async resumeSession(path: string): Promise<SessionResumeResult> {
    const targetPath = resolve(path)
    const current = this.session
    if (current?.path === targetPath) {
      await current.close()
    }

    const records = await replaySession(targetPath)
    const hydrated = hydrateSessionRecords(records, this.terseMode)
    const firstMeta = records[0]?.meta
    const nextCwd = firstMeta?.cwd ?? this.cwd
    const nextModel = firstMeta?.model ?? this.model
    const nextId = basename(targetPath, '.jsonl')

    if (current && current.path !== targetPath) {
      await current.close()
    }

    this.cwd = nextCwd
    this.setModel(nextModel)
    this.sessionId = nextId
    this.messages = hydrated.messages
    this.runState = restoreLatestRunState(records)
    this.tracker = hydrated.tracker
    this.runtime = null
    this.pendingFileUndoSnapshots.clear()
    this.currentTurnFileUndo = null
    this.lastTurnFileUndo = []

    this.session = await SessionWriter.open({
      rootDir: dirname(targetPath),
      id: nextId,
      meta: { cwd: this.cwd, model: this.model },
    })

    return {
      sessionId: nextId,
      path: targetPath,
      cwd: this.cwd,
      model: this.model,
      events: records.length,
      messages: hydrated.messages.length,
      toolCalls: hydrated.toolCalls,
      contextComplete: hydrated.contextComplete,
    }
  }

  /** Continue an interrupted verifiable run; ordinary transcript resumes stay view-only. */
  async resumeAutonomousRun(): Promise<TurnRunResult | null> {
    if (!this.runState || this.runState.verificationObligations.length === 0) return null
    if (this.runState.state === 'DONE' || this.runState.state === 'QUARANTINE') return null
    const policy = this.createCompletionPolicy(this.runState.verificationObligations)
    return this.runTurn(renderResumeInstruction(this.runState), { completionPolicy: policy, resume: true })
  }

  async forkSession(): Promise<SessionForkResult> {
    const current = this.session
    if (!current) {
      throw new Error('No active session to fork.')
    }

    const sourceSessionId = this.sessionId
    const sourcePath = current.path
    const next = await current.fork()
    await current.close()

    this.session = next
    this.sessionId = next.meta.id
    this.runtime = null
    this.pendingFileUndoSnapshots.clear()
    this.currentTurnFileUndo = null
    this.lastTurnFileUndo = []

    return {
      sessionId: next.meta.id,
      path: next.path,
      sourceSessionId,
      sourcePath,
    }
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

  async undoLastFileEdits(): Promise<UndoFileEditsResult> {
    const edits = this.lastTurnFileUndo
    if (edits.length === 0) return { kind: 'empty' }

    const applied: UndoFileEditResult[] = []
    try {
      for (const edit of edits.slice().reverse()) {
        if (edit.existed) {
          await mkdir(dirname(edit.path), { recursive: true })
          await writeFile(edit.path, edit.content)
          applied.push({ path: edit.path, action: 'restored' })
        } else {
          await unlink(edit.path).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== 'ENOENT') throw error
          })
          applied.push({ path: edit.path, action: 'deleted' })
        }
      }
      this.lastTurnFileUndo = []
      return { kind: 'applied', files: applied }
    } catch (error) {
      return {
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
        files: applied,
      }
    }
  }

  async previewRewindTurns(turns: number): Promise<RewindPreview> {
    const boundary = rewindBoundary(this.messages, turns)
    const messagesToDrop = this.messages.length - boundary
    if (messagesToDrop === 0) return { kind: 'empty' }

    const turnsToDrop = countUserTurns(this.messages.slice(boundary))
    // Only the most recent turn's edits are snapshotted, so the preview reports
    // exactly what rewindTurns would revert — no more, no less.
    const files: RewindFilePreview[] = []
    for (const edit of this.lastTurnFileUndo) {
      const current = await readFile(edit.path, 'utf8').catch(() => '')
      const target = edit.existed ? edit.content : ''
      const { added, removed } = lineDiffStats(current, target)
      files.push({
        path: edit.path,
        action: edit.existed ? 'restore' : 'delete',
        linesAdded: added,
        linesRemoved: removed,
      })
    }
    return { kind: 'preview', turnsToDrop, messagesToDrop, files }
  }

  async rewindTurns(turns: number): Promise<RewindResult> {
    const boundary = rewindBoundary(this.messages, turns)
    const messagesDropped = this.messages.length - boundary
    if (messagesDropped === 0) return { kind: 'empty' }

    const turnsDropped = countUserTurns(this.messages.slice(boundary))
    // Revert the most recent turn's file effects (the newest turn we're
    // dropping) before truncating context. Older turns aren't snapshotted, so
    // only the last turn's files can be restored — reported honestly.
    const undo = await this.undoLastFileEdits()
    const filesReverted = undo.kind === 'applied' ? undo.files.length : 0
    const fileError = undo.kind === 'error' ? undo.message : undefined

    this.messages = this.messages.slice(0, boundary)
    this.runtime = null
    return { kind: 'applied', turnsDropped, messagesDropped, filesReverted, fileError }
  }

  // Bounded LLM pass that turns the dropped turns into a faithful digest when
  // the context window compacts. Best-effort: compaction falls back to the
  // deterministic summary if this call fails or returns nothing.
  private buildCompactionSummarizer(): LlmSummarizer {
    const provider = this.provider
    const model = this.model
    return async (digest: string): Promise<string> => {
      const request: ProviderRequest = {
        systemStatic:
          'You compress earlier turns of an AI coding session. Produce a concise, faithful digest that preserves decisions made, facts established, file paths touched, and unresolved threads needed to continue. Terse bullet points, no preamble.',
        systemDynamic: '',
        messages: [{ role: 'user', content: digest }],
        tools: [],
        model,
        maxOutputTokens: 512,
      }
      let text = ''
      let usage: UsageTotals = emptyUsage()
      for await (const ev of provider.stream(request) as AsyncIterable<ProviderStreamEvent>) {
        if (ev.kind === 'text-delta') text += ev.delta
        else if (ev.kind === 'usage') usage = addUsage(usage, ev.usage)
      }
      // The summarizer is runtime infrastructure (invoked from inside a run
      // via deps.compactionSummarizer), but its spend is real — land it in
      // the run budget so dollar caps and warnings see it.
      this.runBudget?.addUsage(usage)
      return text
    }
  }

  async runTurn(input: string, options: TurnRunOptions = {}): Promise<TurnRunResult> {
    const sink = this.eventSink
    const forceCompaction = this.forceCompactFlag
    this.forceCompactFlag = false
    this.pendingFileUndoSnapshots.clear()
    this.currentTurnFileUndo = []

    if (!sink) this.spinner.start('Thinking...')

    // Build dynamic prompt parts (memory context)
    const dynamicParts: string[] = []
    if (this.sharedState.planMode) {
      dynamicParts.push(
        'PLANNING MODE ACTIVE: Do not execute any tools. Only reason and plan. The user will call exit_plan_mode when ready to execute.',
      )
    }
    if (this.goal) {
      dynamicParts.push(`CURRENT SESSION GOAL: ${this.goal.objective}`)
    }
    const workspaceRoots = this.getWorkspaceRoots()
    if (workspaceRoots.length > 1) {
      dynamicParts.push(`READABLE WORKSPACE ROOTS: ${workspaceRoots.join(', ')}`)
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
      compactionThreshold: this.compactionThreshold,
      keepRecentOnCompact: this.keepRecentOnCompact,
      // ~12k-token safety net on a single tool result; raise if real outputs
      // routinely exceed it before the model can narrow its query.
      toolOutputBudgetChars: this.toolOutputBudgetChars,
      budget: {
        maxSteps: 50,
        maxTokens: 200_000,
        maxCostUsd: this.budgetConfig?.maxCostUsd,
        warnCostUsd: this.budgetConfig?.warnCostUsd,
        model: this.model,
      },
      sessionId: this.sessionId,
      cwd: this.cwd,
      effort: this.effort,
      thinkingTokenBudget: thinkingTokenBudgetForEffort(this.effort),
      providerName: this.providerName,
      harnessVersion: CLI_VERSION,
    }

    if (this.runBudget) {
      this.runBudget.updateLimits({
        maxCostUsd: this.budgetConfig?.maxCostUsd,
        warnCostUsd: this.budgetConfig?.warnCostUsd,
        model: this.model,
      })
    } else {
      this.runBudget = new RuntimeBudget(config.budget)
    }

    const systemPrompt: SystemPrompt = buildSystemPrompt({
      staticParts: [
        'You are Orchentra, a terminal AI coding agent focused on efficient, verifiable software work. ' +
          'Help with code, tests, pull-request review, GitHub issues/PRs, and local debugging. ' +
          'When asked about GitHub issues, pull requests, or pasted github.com URLs, ' +
          'always use github_list_issues, github_get_issue, github_list_pulls, github_get_pull, ' +
          'or github_search_issues. Never use web_fetch on github.com — it returns raw HTML and ' +
          'fails on private repos. Pass repos as "owner/repo" or the full URL; the tools parse both.',
        spinePrompt({ terseMode: this.terseMode, budget: this.getBudgetControls(), taskFocus: 'runtime agent' }),
      ],
      dynamicParts,
    })

    const askUser: AskUserHandler = async (request) => {
      if (this.askUserOverride) return this.askUserOverride(request)
      this.spinner.stop()
      try {
        return await askUserHeadless(request)
      } finally {
        if (!sink) this.spinner.start('Thinking...')
      }
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
    if (this.session) {
      await this.session.append({ kind: 'user_message', content: input })
    }
    const deps: ConversationDeps = {
      provider: this.provider,
      tools: this.tools,
      systemPrompt,
      budget: this.runBudget,
      sharedState: this.sharedState,
      askUser,
      enforcer: this.enforcer,
      enforcerAskUser: askToolUser,
      enforcerStore: this.permissionStore,
      enforcerNotifyDeny: async (info) => {
        if (this.notifyDenyOverride) return this.notifyDenyOverride(info)
        process.stderr.write(`\nBlocked ${info.toolName}: ${info.reason}\n`)
      },
      enforcerPolicy: (call) => evaluatePolicy(call, this.policyHandle.ruleset),
      enforcerNotifyPolicy: async (info) => {
        if (this.notifyPolicyOverride) return this.notifyPolicyOverride(info)
        const verb = info.kind === 'allow' ? 'auto-allowed' : 'denied'
        process.stderr.write(`\n${verb} by policy: ${info.rule.tool} ${info.rule.pattern}\n`)
      },
      enforcerToolRequirements: this.tools.requirements?.(),
      permissionMode: this.permissionMode,
      signal: this.currentAbort.signal,
      hookRunner: this.hookRunner ?? undefined,
      spinePrompt: spinePrompt({ terseMode: this.terseMode, budget: this.getBudgetControls(), taskFocus: 'sub-agent' }),
      compactionSummarizer: this.buildCompactionSummarizer(),
      workspaceRoots,
      quirks: this.quirks,
    }

    this.runtime = new ConversationRuntime(config, deps)

    let steps = 0
    let lastUsage: UsageTotals = emptyUsage()
    let assistantText = ''
    let doneReason: DoneReason | undefined

    try {
      const completionPolicy = options.completionPolicy ?? (options.verify ? this.createCompletionPolicy() : undefined)
      for await (const event of this.runtime.run({
        userMessage: input,
        priorMessages: this.messages,
        forceCompaction,
        completionPolicy,
        runState: options.resume ? (this.runState ?? undefined) : undefined,
        resume: options.resume,
      })) {
        await this.handleEvent(event)
        if (event.kind === 'text') {
          assistantText += event.delta
        }
        if (event.kind === 'usage') {
          lastUsage = event.cumulative
          this.tracker.record(event.turn, this.terseMode)
        }
        if (event.kind === 'compacted') {
          this.tracker.recordCompaction(event.tokensSaved)
        }
        if (event.kind === 'tool_output_budgeted') {
          this.tracker.recordToolOutputTrim(event.droppedChars)
        }
        if (event.kind === 'done') {
          steps = event.steps
          lastUsage = event.usage
          doneReason = event.reason
        }
      }

      // Capture the full conversation state (user + assistant + tool messages)
      // so the next turn sees assistant/tool context, not just user prompts.
      this.messages = this.runtime.getFinalMessages()

      if (doneReason === 'stop') {
        await this.captureMemory(input, assistantText, sink)
      }
      if (sink) {
        sink({ kind: 'done', reason: doneReason ?? 'error', steps, usage: lastUsage })
      } else {
        this.spinner.stop()
        process.stdout.write(renderDoneLine(steps, lastUsage, this.model) + '\n')
      }
    } catch (err) {
      doneReason = 'error'
      const message = isProviderAuthError(err) ? friendlyAuthErrorMessage(err) : formatThrown(err)
      if (sink) {
        sink({ kind: 'error', message, retryable: false })
      } else {
        this.spinner.stop()
        process.stdout.write(renderErrorLine(message) + '\n')
      }
    } finally {
      this.lastTurnFileUndo = this.currentTurnFileUndo ?? []
      this.currentTurnFileUndo = null
      this.pendingFileUndoSnapshots.clear()
      this.currentAbort = null
    }
    return { ok: doneReason === 'stop', reason: doneReason ?? 'error' }
  }

  private async handleEvent(event: RuntimeEvent): Promise<void> {
    if (event.kind === 'run_state') this.runState = event.state
    if (event.kind === 'tool_use') {
      await this.captureFileUndoSnapshot(event.call)
    }
    if (event.kind === 'tool_result') {
      this.recordFileUndoSnapshot(event.result.id, event.result.isError)
    }

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
        case 'tool_output_budgeted':
          process.stdout.write(renderToolOutputBudgeted(event.droppedChars, event.keptChars) + '\n')
          break
        case 'cost_warning':
          process.stdout.write(renderCostWarning(event.costUsd, event.thresholdUsd, event.limitUsd) + '\n')
          break
        case 'loop_detected':
          process.stdout.write(renderLoopDetected(event.toolName, event.count) + '\n')
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

  /** k=3 reviewers run in the existing bounded pool, without write capability. */
  private createCompletionPolicy(obligations = defaultVerificationObligations()): CompletionPolicy {
    return new CompletionPolicy({
      obligations,
      k: 3,
      maxRetries: 2,
      replay: new SubagentReplayExecutor({
        runTrial: (state, index) => this.runReplayTrial(state, index),
      }),
    })
  }

  private async runReplayTrial(
    state: RunState,
    index: number,
  ): Promise<{ passed: boolean; summary: string; traceId?: string }> {
    if (this.runBudget?.snapshot().exhausted) {
      return { passed: false, summary: `reviewer replay ${index} skipped: parent budget exhausted` }
    }
    const role = resolveSubagentRole('reviewer').role
    if (!role) return { passed: false, summary: 'reviewer role unavailable' }
    const abort = new AbortController()
    const runtime = new ConversationRuntime(
      {
        model: this.model,
        maxOutputTokens: 2048,
        contextWindowTokens: 200_000,
        compactionThreshold: this.compactionThreshold,
        keepRecentOnCompact: this.keepRecentOnCompact,
        budget: { maxSteps: 10, maxTokens: 50_000, model: this.model },
        sessionId: this.sessionId,
        cwd: this.cwd,
        effort: this.effort,
        providerName: this.providerName,
        harnessVersion: CLI_VERSION,
      },
      {
        provider: this.provider,
        tools: restrictRegistry(this.tools, role),
        systemPrompt: buildSystemPrompt({
          staticParts: [
            role.focus,
            'Independently replay verification for the completed objective. Read and run checks only. Never edit. End only after reporting concrete evidence.',
          ],
          dynamicParts: [],
        }),
        sharedState: this.sharedState,
        subagentDepth: 1,
        signal: abort.signal,
      },
    )
    const evidenceKinds = new Set<string>()
    let reason: DoneReason = 'error'
    for await (const event of runtime.run({
      userMessage: `Replay trial ${index}/3 for objective: ${state.goal}\nRequired evidence: ${state.verificationObligations.map((item) => item.description).join('; ')}`,
    })) {
      if (event.kind === 'tool_result' && !event.result.isError) {
        for (const item of event.result.evidence ?? []) evidenceKinds.add(item.kind)
      } else if (event.kind === 'usage') {
        this.runBudget?.addUsage(event.turn)
        if (this.runBudget?.snapshot().exhausted) abort.abort()
      } else if (event.kind === 'done') {
        reason = event.reason
      }
    }
    const missing = state.verificationObligations
      .filter((obligation) => !obligation.evidenceKinds.every((kind) => evidenceKinds.has(kind)))
      .map((obligation) => obligation.id)
    const passed = reason === 'stop' && missing.length === 0
    return {
      passed,
      summary: passed
        ? `reviewer replay ${index} passed`
        : `reviewer replay ${index} missing ${missing.join(', ') || reason}`,
      traceId: runtime.lastTraceId ?? undefined,
    }
  }

  private async captureFileUndoSnapshot(call: ToolCall): Promise<void> {
    if (call.name !== 'write_file' && call.name !== 'edit_file') return
    const path = toolInputPath(call.input)
    if (!path) return
    const absolutePath = resolveToolPath(this.cwd, path)
    if (!isWithinRoot(absolutePath, this.cwd)) return

    try {
      const content = await readFile(absolutePath, 'utf8')
      this.pendingFileUndoSnapshots.set(call.id, { path: absolutePath, existed: true, content })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.pendingFileUndoSnapshots.set(call.id, { path: absolutePath, existed: false, content: '' })
      }
    }
  }

  private recordFileUndoSnapshot(toolCallId: string, isError: boolean): void {
    const snapshot = this.pendingFileUndoSnapshots.get(toolCallId)
    if (!snapshot) return
    this.pendingFileUndoSnapshots.delete(toolCallId)
    if (!isError) this.currentTurnFileUndo?.push(snapshot)
  }

  // Auto-extract a failure→resolution memory after a successful turn. Gated on
  // `memory.enabled`; failure-shaped turns only; deduped by signature. Best
  // effort — embedding may be unavailable, so a throw here never breaks the turn.
  private async captureMemory(input: string, resolution: string, sink: RuntimeEventSink | null): Promise<void> {
    if (!this.memoryConfig?.enabled) return
    try {
      const receipt = await captureMemoryFromTurn(
        { store: new PatternStore(), embed: embedText, config: this.memoryConfig },
        { orgId: 'default', userMessage: input, resolution },
      )
      if (receipt.status !== 'saved') return
      const event: RuntimeEvent = { kind: 'memory_saved', id: receipt.entryId, signatureHash: receipt.signatureHash }
      if (this.session) await this.session.append(event)
      if (sink) sink(event)
      else process.stdout.write(renderMemorySaved(receipt.entryId) + '\n')
    } catch {
      // best effort — never block a turn on memory capture
    }
  }

  async persistSession(): Promise<void> {
    if (this.session) {
      await this.session.close()
    }
  }
}

function hydrateSessionRecords(
  records: readonly SessionRecord[],
  terseMode: TerseMode,
): {
  messages: ChatMessage[]
  tracker: UsageTracker
  toolCalls: number
  contextComplete: boolean
} {
  const messages: ChatMessage[] = []
  const tracker = new UsageTracker()
  let assistantText = ''
  let assistantToolCalls: ToolCall[] = []
  let toolCalls = 0
  let userMessages = 0

  const flushAssistant = (): void => {
    if (assistantText.length === 0 && assistantToolCalls.length === 0) return
    messages.push({
      role: 'assistant',
      content: assistantText,
      toolCalls: assistantToolCalls.length > 0 ? assistantToolCalls : undefined,
    })
    assistantText = ''
    assistantToolCalls = []
  }

  for (const record of records) {
    const event = record.event
    switch (event.kind) {
      case 'user_message':
        flushAssistant()
        messages.push({ role: 'user', content: event.content })
        userMessages++
        break
      case 'text':
        assistantText += event.delta
        break
      case 'tool_use':
        assistantToolCalls.push(event.call)
        toolCalls++
        break
      case 'tool_result':
        flushAssistant()
        messages.push({ role: 'tool', content: event.result.content, toolCallId: event.result.id })
        break
      case 'usage':
        tracker.record(event.turn, terseMode)
        break
      case 'compacted':
        tracker.recordCompaction(event.tokensSaved)
        break
      case 'tool_output_budgeted':
        tracker.recordToolOutputTrim(event.droppedChars)
        break
    }
  }
  flushAssistant()

  return {
    messages,
    tracker,
    toolCalls,
    contextComplete: userMessages > 0,
  }
}

function restoreLatestRunState(records: readonly SessionRecord[]): RunState | null {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const event = records[index]!.event
    if (event.kind !== 'run_state') continue
    const restored = restoreRunState(event.state)
    if (restored) return restored
  }
  return null
}

function defaultVerificationObligations(): readonly RunState['verificationObligations'][number][] {
  return [
    {
      id: 'executable-verification',
      description: 'run a relevant command and collect its exit status',
      evidenceKinds: ['exit-status'],
    },
  ]
}

function renderResumeInstruction(state: RunState): string {
  const retries = `assert=${state.retryCounters.assertion}, gate=${state.retryCounters.gate}`
  const obligations = state.verificationObligations.map((item) => item.description).join('; ')
  return `Resume autonomous objective: ${state.goal}\nCheckpoint: ${state.state}; retries ${retries}.\nRequired verification: ${obligations}\nContinue from this checkpoint; do not repeat completed destructive work.`
}

async function askUserHeadless(request: string | AskUserRequest): Promise<string> {
  if (typeof request === 'string') {
    process.stdout.write(`\n${request}\n`)
    const outcome = await readLine('> ')
    return outcome.type === 'submit' ? outcome.text : ''
  }

  process.stdout.write(`\n${request.question}\n`)
  const options = request.options ?? []
  if (options.length === 0) {
    const outcome = await readLine('> ')
    return outcome.type === 'submit' ? outcome.text : ''
  }

  const allowOther = request.allowOther !== false
  options.forEach((option, index) => {
    process.stdout.write(`${index + 1}. ${option.label}\n`)
    if (option.description) process.stdout.write(`   ${option.description}\n`)
  })
  if (allowOther) process.stdout.write(`${options.length + 1}. Other\n`)

  const outcome = await readLine('> ')
  if (outcome.type !== 'submit') return cancelledAskUserResponse(request)
  const text = outcome.text.trim()
  if (text.length === 0) return cancelledAskUserResponse(request)

  if (request.multiSelect === true) {
    const indexes: number[] = []
    let other: string | undefined
    const otherTokens: string[] = []
    for (const token of text.split(/[\s,]+/).filter(Boolean)) {
      const numeric = Number(token)
      if (Number.isInteger(numeric) && numeric >= 1 && numeric <= options.length) {
        indexes.push(numeric - 1)
      } else if (allowOther && numeric === options.length + 1) {
        other = await readOtherLine()
      } else if (allowOther) {
        otherTokens.push(token)
      }
    }
    if (!other && otherTokens.length > 0) other = otherTokens.join(' ')
    return askUserResponse(request, uniqueIndexes(indexes), other)
  }

  const numeric = Number(text)
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= options.length) {
    return askUserResponse(request, [numeric - 1])
  }
  if (allowOther && numeric === options.length + 1) {
    return askUserResponse(request, [], await readOtherLine())
  }
  if (allowOther) return askUserResponse(request, [], text)
  return cancelledAskUserResponse(request)
}

async function readOtherLine(): Promise<string> {
  const outcome = await readLine('Other> ')
  return outcome.type === 'submit' ? outcome.text.trim() : ''
}

function askUserResponse(request: AskUserRequest, indexes: readonly number[], other?: string): string {
  const options = request.options ?? []
  return JSON.stringify({
    question: request.question,
    multiSelect: request.multiSelect === true,
    selectedOptions: indexes.map((index) => {
      const option = options[index]!
      return option.id ? { index, id: option.id, label: option.label } : { index, label: option.label }
    }),
    ...(other && other.length > 0 ? { other } : {}),
  })
}

function cancelledAskUserResponse(request: AskUserRequest): string {
  return JSON.stringify({ question: request.question, cancelled: true })
}

function uniqueIndexes(indexes: readonly number[]): readonly number[] {
  return Array.from(new Set(indexes)).sort((a, b) => a - b)
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

function toolInputPath(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null
  const path = (input as { path?: unknown }).path
  return typeof path === 'string' && path.length > 0 ? path : null
}

function resolveToolPath(cwd: string, path: string): string {
  return resolve(cwd, path)
}

function isWithinRoot(path: string, root: string): boolean {
  const normalizedRoot = resolve(root)
  const normalizedPath = resolve(path)
  const rootWithSlash = normalizedRoot.endsWith('/') ? normalizedRoot : `${normalizedRoot}/`
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(rootWithSlash)
}
