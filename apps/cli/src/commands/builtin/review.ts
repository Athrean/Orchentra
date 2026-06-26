import { PatternStore } from '@orchentra/cli-core'
import type { MemoryStore } from '@orchentra/cli-core'
import {
  GitHubClient,
  listIssueComments,
  listPullReviewComments,
  resolveToken,
  type IssueComment,
  type PullReviewComment,
  type ResolvedToken,
} from '@orchentra/cli-api'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { review, type CheckRunner, type ReviewResult } from '../../composites/review'
import { buildOneShotLlmCaller } from '../../composites/llm-caller'
import type { LlmCaller } from '../../composites/scan'
import { applyReviewFeedback, parseReviewFeedbackComments } from '../../composites/review-feedback'
import { inferGitHubOwner, type GitHubRepo } from '../../util/git-owner'

/**
 * Phase J /review — propose findings, then verify by running the project's
 * own checks. Findings are the untrusted producer; the executed checks are
 * the trusted checker. /scan stays LLM-only; /review adds the running.
 */
export class ReviewCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'review',
    aliases: [],
    summary: 'Review changes, then verify by running the project checks (BYOK)',
    argumentHint: '[--diff|--full|--path <p> | feedback --pr <n>]',
  }

  // Inject for tests; production builds a one-shot caller from the session model.
  constructor(private readonly deps?: ReviewCommandDeps) {}

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    if ((args[0] ?? '').toLowerCase() === 'feedback') return this.executeFeedback(args.slice(1), ctx)

    let mode: 'diff' | 'full' | 'path' = 'diff'
    let path: string | undefined
    for (let i = 0; i < args.length; i++) {
      const tok = args[i]
      if (tok === '--diff') mode = 'diff'
      else if (tok === '--full') mode = 'full'
      else if (tok === '--path') {
        mode = 'path'
        path = args[++i]
      }
    }

    const llm = this.deps?.llm ?? buildOneShotLlmCaller(ctx.session.getModel())
    const result = await review({ cwd: ctx.cwd, mode, path, llm, run: this.deps?.run })
    if ('error' in result) {
      const text = `error: ${result.error}`
      if (ctx.ui) ctx.ui({ kind: 'note', tone: 'warn', text })
      else process.stderr.write(text + '\n')
      return false
    }

    const text = render(result)
    if (ctx.ui) ctx.ui({ kind: 'text', text })
    else process.stdout.write(text + '\n')
    return true
  }

  private async executeFeedback(args: string[], ctx: CommandContext): Promise<boolean> {
    const pullNumber = parsePullNumber(args)
    if (pullNumber === null) return note(ctx, 'usage: /review feedback --pr <number>', 'warn')

    const repo = (this.deps?.inferRepo ?? inferGitHubOwner)(ctx.cwd)
    if (!repo) return note(ctx, 'No GitHub origin remote found for this workspace.', 'warn')

    const token = (this.deps?.resolveToken ?? resolveToken)()
    if (!token) {
      return note(
        ctx,
        'No GitHub token available. Set ORCHENTRA_GITHUB_TOKEN or GITHUB_TOKEN, or run gh auth login.',
        'warn',
      )
    }

    try {
      const client = this.deps?.createClient?.(token.token) ?? new GitHubClient({ token: token.token })
      const issueComments = await (this.deps?.listIssueComments ?? listIssueComments)(
        client,
        repo.owner,
        repo.repo,
        pullNumber,
      )
      const reviewComments = await (this.deps?.listPullReviewComments ?? listPullReviewComments)(
        client,
        repo.owner,
        repo.repo,
        pullNumber,
      )
      const markers = parseReviewFeedbackComments([...issueComments, ...reviewComments].map(toFeedbackComment))
      const store = this.deps?.store ?? new PatternStore()
      const result = applyReviewFeedback(store, this.deps?.orgId ?? 'default', markers, this.deps?.now)
      return note(ctx, renderFeedbackSummary(markers.length, result), markers.length === 0 ? 'warn' : 'info')
    } catch (error) {
      return note(
        ctx,
        `Failed to ingest review feedback: ${error instanceof Error ? error.message : String(error)}`,
        'warn',
      )
    }
  }
}

export interface ReviewCommandDeps {
  readonly llm?: LlmCaller
  readonly run?: CheckRunner
  readonly store?: MemoryStore
  readonly orgId?: string
  readonly now?: () => Date
  readonly inferRepo?: (cwd: string) => GitHubRepo | null
  readonly resolveToken?: () => ResolvedToken | null
  readonly createClient?: (token: string) => GitHubClient
  readonly listIssueComments?: (
    client: GitHubClient,
    owner: string,
    repo: string,
    issueNumber: number,
  ) => Promise<IssueComment[]>
  readonly listPullReviewComments?: (
    client: GitHubClient,
    owner: string,
    repo: string,
    pullNumber: number,
  ) => Promise<PullReviewComment[]>
}

function render(r: ReviewResult): string {
  const lines: string[] = []

  if (r.findings.length === 0) {
    lines.push('Findings: none proposed.')
  } else {
    lines.push('Findings (proposed — verify against the checks below):')
    for (const f of r.findings) {
      const tag = f.corroboratedBy.length > 0 ? ` — corroborated by: ${f.corroboratedBy.join(', ')}` : ' — unverified'
      lines.push(`  [${f.severity}] ${f.file}${f.line !== null ? `:${f.line}` : ''} — ${f.title}${tag}`)
      lines.push(`    ${f.description}`)
      if (f.suggestedFix) lines.push(`    fix: ${f.suggestedFix}`)
    }
  }
  lines.push('')

  if (r.checks.length === 0) {
    lines.push('Verified by running: no project checks found — findings are advisory only.')
  } else {
    lines.push('Verified by running:')
    for (const c of r.checks) {
      lines.push(`  [${c.passed ? 'ok' : 'FAIL'}] ${c.name} — ${c.command} (exit ${c.exitCode})`)
      if (!c.passed && c.output.trim().length > 0) {
        for (const ln of c.output.trimEnd().split('\n')) lines.push(`    ${ln}`)
      }
    }
    lines.push('')
    const failed = r.checks.filter((c) => !c.passed)
    const corroborated = r.findings.filter((f) => f.corroboratedBy.length > 0).length
    if (failed.length === 0) {
      lines.push('Verdict: all checks pass — proposed findings are advisory (no gate reproduces them).')
    } else if (corroborated > 0) {
      lines.push(
        `Verdict: ${failed.length} check(s) failing; ${corroborated}/${r.findings.length} finding(s) corroborated by a failing gate.`,
      )
    } else {
      lines.push(
        `Verdict: ${failed.length} check(s) failing, but none reference a proposed finding — failures and findings look unrelated.`,
      )
    }
  }

  lines.push('')
  lines.push(`(model: ${r.model} · in ${r.tokensIn} · out ${r.tokensOut})`)
  return lines.join('\n')
}

function note(ctx: CommandContext, text: string, tone: 'info' | 'warn' = 'info'): boolean {
  if (ctx.ui) ctx.ui({ kind: 'note', tone, text })
  else {
    const stream = tone === 'warn' ? process.stderr : process.stdout
    stream.write(text + '\n')
  }
  return tone !== 'warn'
}

function parsePullNumber(args: readonly string[]): number | null {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pr') {
      const value = Number(args[i + 1])
      return Number.isInteger(value) && value > 0 ? value : null
    }
  }
  return null
}

function toFeedbackComment(comment: IssueComment | PullReviewComment): { id: string; body: string; url: string } {
  return { id: String(comment.id), body: comment.body, url: comment.html_url }
}

function renderFeedbackSummary(markerCount: number, result: ReturnType<typeof applyReviewFeedback>): string {
  if (markerCount === 0) return 'No review feedback markers found.'
  return [
    `Applied review feedback: ${result.applied.length} applied, ${result.missing.length} missing, ${result.ambiguous.length} ambiguous, ${result.ignored.length} ignored.`,
    ...result.missing.map((m) => `Missing memory: ${m.memoryId} (${m.feedback})`),
    ...result.ambiguous.map((m) => `Ambiguous memory: ${m.memoryId} (${m.matches} matches)`),
    ...result.ignored.map((m) => `Ignored memory: ${m.memoryId} (${m.reason})`),
  ].join('\n')
}
