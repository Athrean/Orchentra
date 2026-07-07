import { spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { estimateCost, formatUsd, pricingForModel } from '@orchentra/cli-core'
import type { RewindPreview } from '@orchentra/cli-core'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import type { UiCardSection } from '../ui-output'
import { writeClipboard } from '../../ui/clipboard'
import { loadHooks } from '../../hooks/load-hooks'
import { buildContextSections } from './context-report'

export class ContextCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'context',
    aliases: ['ctx'],
    summary: 'Show context-window usage and distance to compaction',
  }

  async execute(_args: string[], ctx: CommandContext): Promise<boolean> {
    const stats = ctx.session.getContextStats?.()
    if (!stats) return note(ctx, 'Context stats are unavailable in this session.', 'warn')

    const sections = buildContextSections({
      stats,
      usage: ctx.session.getUsage(),
      turns: ctx.session.getTurns(),
      savings: ctx.session.getSavings?.(),
      breakdown: ctx.session.getContextBreakdown?.(),
    })
    return card(ctx, 'Context', ctx.session.getModel(), sections)
  }
}

export class CopyCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'copy',
    aliases: [],
    summary: 'Copy the visible transcript to clipboard',
    argumentHint: '[transcript]',
  }

  async execute(_args: string[], ctx: CommandContext): Promise<boolean> {
    const text = ctx.getTranscriptText?.()
    if (!text) return note(ctx, 'Nothing to copy yet.', 'warn')

    const ok = writeClipboard(text)
    return note(
      ctx,
      ok ? `Copied transcript (${formatNumber(text.length)} chars).` : 'Clipboard unavailable.',
      ok ? 'info' : 'warn',
    )
  }
}

export class CdCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'cd',
    aliases: [],
    summary: 'Change this session working directory',
    argumentHint: '<path>',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const target = args.join(' ').trim()
    if (!target) return note(ctx, `cwd: ${prettyCwd(ctx.cwd)}`)
    const next = resolvePath(ctx.cwd, target)
    if (!existsSync(next)) return note(ctx, `Directory not found: ${target}`, 'warn')
    if (!statSync(next).isDirectory()) return note(ctx, `Not a directory: ${target}`, 'warn')

    process.chdir(next)
    ctx.session.setCwd?.(next)
    ctx.setCwd?.(next)
    return note(ctx, `cwd: ${prettyCwd(next)}`)
  }
}

export class AddDirCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'add-dir',
    aliases: ['adddir'],
    summary: 'Add an extra read/search workspace root',
    argumentHint: '<path>',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const target = args.join(' ').trim()
    const roots = ctx.session.getWorkspaceRoots?.() ?? [ctx.cwd]
    if (!target) {
      return card(ctx, 'Read Roots', `${roots.length} root${roots.length === 1 ? '' : 's'}`, [
        {
          rows: roots.map((root, index) => ({ key: index === 0 ? 'cwd' : String(index + 1), value: prettyCwd(root) })),
        },
      ])
    }

    const addRoot = ctx.session.addWorkspaceRoot
    if (!addRoot) return note(ctx, 'This runtime does not support /add-dir.', 'warn')

    const next = resolvePath(ctx.cwd, target)
    if (!existsSync(next)) return note(ctx, `Directory not found: ${target}`, 'warn')
    if (!statSync(next).isDirectory()) return note(ctx, `Not a directory: ${target}`, 'warn')

    const before = new Set(roots.map((root) => resolve(root)))
    addRoot(next)
    return note(
      ctx,
      before.has(resolve(next)) ? `Read root already added: ${prettyCwd(next)}` : `Added read root: ${prettyCwd(next)}`,
    )
  }
}

export class BackgroundCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'background',
    aliases: ['bg'],
    summary: 'Save this session and leave the foreground TUI',
  }

  async execute(_args: string[], ctx: CommandContext): Promise<boolean> {
    note(ctx, `Session ${ctx.session.getSessionId()} saved. Resume with /resume latest.`)
    return false
  }
}

export class TasksCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'tasks',
    aliases: [],
    summary: 'View or cancel background agent tasks',
    argumentHint: '[cancel <id>]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    if (args[0] === 'cancel') {
      const id = args[1]
      if (!id) return note(ctx, 'Usage: /tasks cancel <id>', 'warn')
      const ok = ctx.session.cancelTask?.(id) ?? false
      return note(ctx, ok ? `Cancelled ${id}.` : `Task not found: ${id}`, ok ? 'info' : 'warn')
    }

    const tasks = ctx.session.listTaskSummaries?.() ?? []
    if (tasks.length === 0) {
      return card(ctx, 'Tasks', 'No background tasks', [
        {
          rows: [
            { key: 'Status', value: 'idle' },
            { key: 'Start', value: 'Use the agent tool during a turn; tasks appear here.' },
          ],
        },
      ])
    }

    return card(ctx, 'Tasks', `${tasks.length} task${tasks.length === 1 ? '' : 's'}`, [
      {
        rows: tasks.map((task) => ({
          key: shortId(task.id),
          value: `${task.status} - ${trimOneLine(task.prompt ?? task.output ?? '(no prompt)', 72)}`,
        })),
      },
    ])
  }
}

export class UndoCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'undo',
    aliases: [],
    summary: "Revert the previous turn's file edits",
  }

  async execute(_args: string[], ctx: CommandContext): Promise<boolean> {
    const result = await ctx.session.undoLastFileEdits?.()
    if (!result) return note(ctx, 'This runtime does not support /undo.', 'warn')
    if (result.kind === 'empty') return note(ctx, 'No file edits to undo.', 'warn')
    if (result.kind === 'error') {
      return note(ctx, `Undo failed after ${result.files.length} file(s): ${result.message}`, 'warn')
    }
    const noun = result.files.length === 1 ? 'file edit' : 'file edits'
    const files = result.files.map((file) => `${file.path} ${file.action}`).join(', ')
    return note(ctx, `Undid ${result.files.length} ${noun}: ${files}.`)
  }
}

export class RewindCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'rewind',
    aliases: [],
    summary: 'Roll the conversation back N turns (context + last turn files)',
    argumentHint: '[n] [--yes]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const confirmed = args.some((a) => a === '--yes' || a === '-y')
    const positional = args.filter((a) => a !== '--yes' && a !== '-y')
    const turns = parseTurns(positional[0])
    if (turns === null) return note(ctx, 'Usage: /rewind [n] [--yes] — n must be a positive integer.', 'warn')

    // Rewind reverts files on disk — a destructive step. Default to a dry-run
    // preview so the user sees what changes before it happens; --yes applies it.
    if (!confirmed) {
      const preview = ctx.session.previewRewindTurns
      if (!preview) return note(ctx, 'This runtime does not support /rewind.', 'warn')
      const result = await preview(turns)
      if (result.kind === 'empty') return note(ctx, 'Nothing to rewind.', 'warn')
      return renderRewindPreview(ctx, turns, result)
    }

    const rewind = ctx.session.rewindTurns
    if (!rewind) return note(ctx, 'This runtime does not support /rewind.', 'warn')

    const result = await rewind(turns)
    if (result.kind === 'empty') return note(ctx, 'Nothing to rewind.', 'warn')

    const parts = [`Rewound ${result.turnsDropped} turn${result.turnsDropped === 1 ? '' : 's'} from context`]
    if (result.filesReverted > 0) {
      parts.push(`reverted ${result.filesReverted} file edit${result.filesReverted === 1 ? '' : 's'}`)
    }
    if (result.fileError) parts.push(`file revert failed: ${result.fileError}`)
    return note(ctx, `${parts.join(' · ')}.`, result.fileError ? 'warn' : 'info')
  }
}

function renderRewindPreview(
  ctx: CommandContext,
  turns: number,
  preview: Extract<RewindPreview, { kind: 'preview' }>,
): boolean {
  const contextRows = [
    { key: 'Turns to drop', value: String(preview.turnsToDrop), bold: true },
    { key: 'Messages to drop', value: String(preview.messagesToDrop) },
  ]
  const fileRows =
    preview.files.length === 0
      ? [{ key: 'Files', value: 'none — context only, nothing on disk changes' }]
      : preview.files.map((file) => ({
          key: prettyCwd(file.path),
          value: `${file.action} · +${file.linesAdded}/-${file.linesRemoved}`,
        }))
  return card(ctx, 'Rewind preview', `${turns} turn${turns === 1 ? '' : 's'} · not applied yet`, [
    { title: 'Context', rows: contextRows },
    { title: 'Files to revert', rows: fileRows },
    { title: 'Apply', rows: [{ key: 'Confirm', value: `/rewind ${turns} --yes` }] },
  ])
}

function parseTurns(arg: string | undefined): number | null {
  if (arg === undefined) return 1
  const n = Number(arg)
  return Number.isInteger(n) && n >= 1 ? n : null
}

export class BranchCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'branch',
    aliases: [],
    summary: 'Create and switch to a git branch',
    argumentHint: '[name]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const result = switchBranch(ctx, args[0], 'work')
    if (!result.ok) return note(ctx, result.message, 'warn')
    return note(ctx, `Switched from ${result.from} to ${result.to}.`)
  }
}

export class ForkCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'fork',
    aliases: [],
    summary: 'Create a fork branch for a parallel line of work',
    argumentHint: '[name]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const forkSession = ctx.session.forkSession
    if (!forkSession) return note(ctx, 'This runtime does not support session forking.', 'warn')

    const branch = switchBranch(ctx, args[0], 'fork')
    if (!branch.ok) return note(ctx, branch.message, 'warn')

    try {
      const session = await forkSession()
      return note(ctx, `Switched from ${branch.from} to ${branch.to}. Forked session: ${session.sessionId}.`)
    } catch (error) {
      if (branch.from !== 'detached') {
        git(ctx.cwd, ['switch', branch.from])
      }
      return note(ctx, `Switched to ${branch.to}, but session fork failed: ${formatError(error)}`, 'warn')
    }
  }
}

export class GoalCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'goal',
    aliases: [],
    summary: 'Set, inspect, or clear the session goal',
    argumentHint: '[status|clear|replace <objective>|<objective>]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const op = args[0]?.toLowerCase()
    if (!op || op === 'status') {
      const goal = ctx.session.getGoal?.()
      if (!goal) return note(ctx, 'No session goal set.')
      return card(ctx, 'Goal', 'active', [
        {
          rows: [
            { key: 'Objective', value: goal.objective, bold: true },
            { key: 'Created', value: goal.createdAt },
          ],
        },
      ])
    }
    if (op === 'clear' || op === 'cancel' || op === 'off') {
      ctx.session.clearGoal?.()
      return note(ctx, 'Goal cleared.')
    }

    const objective = (op === 'replace' || op === 'set' ? args.slice(1) : args).join(' ').trim()
    if (!objective) return note(ctx, 'Usage: /goal <objective>', 'warn')
    const goal = ctx.session.setGoal?.(objective)
    if (!goal) return note(ctx, 'This runtime does not support session goals.', 'warn')
    return note(ctx, `Goal set: ${goal.objective}`)
  }
}

export class HooksCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'hooks',
    aliases: [],
    summary: 'Inspect repo-local hook configuration',
  }

  async execute(_args: string[], ctx: CommandContext): Promise<boolean> {
    const config = loadHooks(ctx.cwd)
    const hooks = config.hooks
    const rows =
      hooks.length === 0
        ? [{ key: 'Configured hooks', value: '0' }]
        : hooks.map((hook, idx) => ({
            key: `${idx + 1}. ${hook.event}`,
            value: `${hook.tools.join(', ')} -> ${trimOneLine(hook.command, 72)}`,
          }))
    return card(ctx, 'Hooks', '.orchentra/hooks.json', [{ rows }])
  }
}

export class TerminalSetupCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'terminal-setup',
    aliases: [],
    summary: 'Show terminal keybinding setup guidance',
  }

  async execute(_args: string[], ctx: CommandContext): Promise<boolean> {
    return card(ctx, 'Terminal Setup', 'keybindings', [
      {
        rows: [
          { key: 'Newline', value: 'Shift+Enter or Alt+Enter' },
          { key: 'External editor', value: 'Ctrl+X' },
          { key: 'Command palette', value: 'Ctrl+P' },
          { key: 'Mode cycle', value: 'Shift+Tab' },
        ],
      },
    ])
  }
}

export class TuiCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'tui',
    aliases: [],
    summary: 'Inspect terminal renderer mode',
    argumentHint: '[default|fullscreen]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const requested = args[0]
    const rows = [
      { key: 'Renderer', value: 'default' },
      { key: 'Fullscreen', value: 'not enabled' },
      { key: 'Requested', value: requested ?? '(none)' },
    ]
    if (requested && !['default', 'fullscreen'].includes(requested)) {
      return note(ctx, 'Usage: /tui [default|fullscreen]', 'warn')
    }
    return card(ctx, 'TUI', 'renderer', [{ rows }])
  }
}

export class StatuslineCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'statusline',
    aliases: [],
    summary: 'Show the footer/statusline fields',
  }

  async execute(_args: string[], ctx: CommandContext): Promise<boolean> {
    return card(ctx, 'Statusline', 'footer', [
      {
        rows: [
          { key: 'Model', value: ctx.session.getModel() },
          { key: 'Mode', value: ctx.session.getPermissionMode() },
          { key: 'Terse', value: ctx.session.getTerseMode?.() ?? 'off' },
          { key: 'cwd', value: prettyCwd(ctx.cwd) },
        ],
      },
    ])
  }
}

export class UsageCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'usage',
    aliases: [],
    summary: 'Show session token and cost usage',
  }

  async execute(_args: string[], ctx: CommandContext): Promise<boolean> {
    const usage = ctx.session.getUsage()
    const pricing = pricingForModel(ctx.session.getModel())
    const cost = pricing ? estimateCost(usage, pricing) : undefined
    const rows = [
      { key: 'Input', value: formatNumber(usage.inputTokens) },
      { key: 'Output', value: formatNumber(usage.outputTokens) },
      { key: 'Cache create', value: formatNumber(usage.cacheCreationTokens) },
      { key: 'Cache read', value: formatNumber(usage.cacheReadTokens) },
      { key: 'Total tokens', value: formatNumber(totalTokens(usage)), bold: true },
    ]
    const sections: UiCardSection[] = [{ title: 'Tokens', rows }]
    if (cost) {
      sections.push({
        title: 'Estimated cost',
        rows: [
          { key: 'Input', value: formatUsd(cost.inputCostUsd) },
          { key: 'Output', value: formatUsd(cost.outputCostUsd) },
          { key: 'Cache create', value: formatUsd(cost.cacheCreationCostUsd) },
          { key: 'Cache read', value: formatUsd(cost.cacheReadCostUsd) },
          {
            key: 'Total',
            value: formatUsd(
              cost.inputCostUsd + cost.outputCostUsd + cost.cacheCreationCostUsd + cost.cacheReadCostUsd,
            ),
            bold: true,
          },
        ],
      })
    }
    return card(ctx, 'Usage', ctx.session.getModel(), sections)
  }
}

export class UsageCreditsCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'usage-credits',
    aliases: [],
    summary: 'Explain usage credits for the active runtime',
  }

  async execute(_args: string[], ctx: CommandContext): Promise<boolean> {
    return card(ctx, 'Usage Credits', 'BYOK runtime', [
      {
        rows: [
          { key: 'Plan credits', value: 'not used' },
          { key: 'Billing path', value: 'provider API key / local account' },
          { key: 'Budget controls', value: 'use config cost caps and /usage' },
        ],
      },
    ])
  }
}

type BranchSwitchResult = { ok: true; from: string; to: string } | { ok: false; message: string }

function switchBranch(ctx: CommandContext, rawName: string | undefined, prefix: string): BranchSwitchResult {
  const name = sanitizeBranchName(rawName ?? `${prefix}/${timestampSlug()}`)
  const current = git(ctx.cwd, ['branch', '--show-current'])
  if (!current.ok) return { ok: false, message: 'Not inside a git repository.' }

  const result = git(ctx.cwd, ['switch', '-c', name])
  if (!result.ok) return { ok: false, message: result.err || `Could not create branch ${name}.` }
  return { ok: true, from: current.out.trim() || 'detached', to: name }
}

function git(cwd: string, args: readonly string[]): { ok: true; out: string } | { ok: false; err: string } {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 5000 })
  if (r.status === 0) return { ok: true, out: r.stdout.trimEnd() }
  return { ok: false, err: (r.stderr || r.stdout || '').trim() }
}

function card(ctx: CommandContext, title: string, subtitle: string, sections: readonly UiCardSection[]): boolean {
  if (ctx.ui) ctx.ui({ kind: 'card', title, subtitle, sections })
  else {
    const lines = [subtitle ? `${title} - ${subtitle}` : title]
    for (const section of sections) {
      if (section.title) lines.push('', section.title)
      const width = Math.max(0, ...section.rows.map((r) => r.key.length))
      for (const row of section.rows) lines.push(`  ${row.key.padEnd(width)}  ${row.value}`)
    }
    process.stdout.write(lines.join('\n') + '\n')
  }
  return true
}

function note(ctx: CommandContext, text: string, tone: 'info' | 'warn' = 'info'): boolean {
  if (ctx.ui) ctx.ui({ kind: 'note', text, tone })
  else process.stdout.write(text + '\n')
  return true
}

function resolvePath(cwd: string, target: string): string {
  if (target === '~') return homedir()
  if (target.startsWith('~/')) return resolve(homedir(), target.slice(2))
  return resolve(cwd, target)
}

function prettyCwd(cwd: string): string {
  const home = homedir()
  if (cwd === home) return '~'
  if (cwd.startsWith(`${home}/`)) return `~${cwd.slice(home.length)}`
  return cwd
}

function trimOneLine(s: string, max: number): string {
  const single = s.replace(/\s+/g, ' ').trim()
  if (single.length <= max) return single
  return `${single.slice(0, max - 3)}...`
}

function shortId(id: string): string {
  return id.length <= 18 ? id : `${id.slice(0, 18)}...`
}

function sanitizeBranchName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._/-]/g, '-')
    .replace(/^-+|-+$/g, '')
}

function timestampSlug(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-')
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function totalTokens(usage: {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
}): number {
  return usage.inputTokens + usage.outputTokens + usage.cacheCreationTokens + usage.cacheReadTokens
}
