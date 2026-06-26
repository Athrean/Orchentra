import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { terseModePrompt } from '@orchentra/cli-core'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { architect, type ArchitectPlan } from '../../composites/architect'
import { planSlices, type Slice } from '../../composites/slices'
import { build, type BuildResult, type RunCheck, type RunSlice } from '../../composites/build'
import { discoverChecks, defaultRun, type CheckRunner } from '../../composites/review'
import { buildOneShotLlmCaller } from '../../composites/llm-caller'
import type { LlmCaller } from '../../composites/scan'
import { ensureDir } from '../../init'

const BUILDER_PROMPT = [
  'You are a disciplined senior engineer implementing one vertical slice.',
  'Test-driven: make the slice satisfy the stated verification; write the minimum code that passes.',
  'Lean ladder (stop at the first rung that works): does it need to exist? → stdlib → native platform → already-installed dependency → one line → minimum custom code.',
  'Surgical: change only what this slice needs; match the surrounding style; no speculative abstractions.',
  'Return ONLY the complete contents of the target file. No prose, no markdown.',
].join('\n')

/**
 * /build — the builder leg of plan → build → review. Architects the need into
 * vertical slices, implements each (one-shot codegen written to its file), and
 * gates every slice on the project's own checks — a slice is "completed" only
 * when those checks pass, the same verify-by-running trust /review uses. Never
 * commits or pushes; the working tree stays the user's to review.
 */
export class BuildCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'build',
    aliases: [],
    summary: 'Implement a need as vertical slices, gated by the project checks (BYOK)',
    argumentHint: '<what to build>',
  }

  // Inject for tests; production builds the caller + check runner from the cwd.
  constructor(private readonly deps?: { llm?: LlmCaller; run?: CheckRunner; budget?: { maxTokens: number } }) {}

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const need = args.join(' ').trim()
    if (need.length === 0) {
      emit(ctx, 'usage: /build <what to build> — e.g. /build add a rate limiter to the bash tool', 'warn')
      return true
    }

    const llm = this.deps?.llm ?? buildOneShotLlmCaller(ctx.session.getModel())
    const terse = ctx.session.getTerseMode?.()
    const planned = await architect({ need, llm, terseMode: terse })
    if ('error' in planned) {
      emit(ctx, `error: ${planned.error}`, 'warn')
      return false
    }

    const slices = planSlices(planned)
    if (slices.length === 0) {
      emit(ctx, 'nothing to build: the plan proposed no files.', 'warn')
      return true
    }

    const builderSystem = [BUILDER_PROMPT, terse ? terseModePrompt(terse) : ''].filter(Boolean).join('\n')
    const runSlice: RunSlice = async (slice) => {
      const out = await llm({ systemPrompt: builderSystem, userPrompt: builderUser(slice, planned.verification) })
      const wrote = writeImpl(join(ctx.cwd, slice.files[0]), stripFence(out.text))
      return {
        text: wrote ? `wrote ${slice.files[0]}` : `kept existing ${slice.files[0]}`,
        tokensIn: out.tokensIn,
        tokensOut: out.tokensOut,
      }
    }

    const run = this.deps?.run ?? defaultRun
    const checks = discoverChecks(ctx.cwd)
    const runCheck: RunCheck = async () => {
      const results = checks.map((c) => ({ c, r: run(c.command, ctx.cwd) }))
      const passed = results.every((x) => x.r.exitCode === 0)
      const output = results
        .filter((x) => x.r.exitCode !== 0)
        .map((x) => `${x.c.name}: ${x.r.output}`)
        .join('\n')
      return { passed, output }
    }

    const result = await build({ slices, runSlice, runCheck, budget: this.deps?.budget })
    const text = render(result, planned)
    if (ctx.ui) ctx.ui({ kind: 'text', text })
    else process.stdout.write(text + '\n')
    return true
  }
}

function builderUser(slice: Slice, verification: string[]): string {
  const checks =
    verification.length > 0 ? `\nVerification to satisfy:\n${verification.map((v) => `- ${v}`).join('\n')}` : ''
  return `Target file: ${slice.files[0]}\nIntent: ${slice.intent}${checks}\nReturn the file's complete contents.`
}

/** A scaffold stub (empty or a lone TODO marker) is safe to fill; real code is not. */
function isStub(content: string): boolean {
  const t = content.trim()
  return t.length === 0 || t.startsWith('// TODO:')
}

function writeImpl(abs: string, content: string): boolean {
  if (existsSync(abs) && !isStub(readFileSync(abs, 'utf8'))) return false
  ensureDir(dirname(abs))
  writeFileSync(abs, content, 'utf8')
  return true
}

function stripFence(text: string): string {
  const m = text.match(/```(?:[a-zA-Z]+)?\s*([\s\S]*?)```/)
  return (m ? m[1] : text).trim() + '\n'
}

function render(r: BuildResult, plan: ArchitectPlan): string {
  const lines: string[] = []
  lines.push(`Built: ${r.completed.length} completed, ${r.failed.length} failed, ${r.skipped.length} skipped`)
  lines.push('')
  for (const s of r.completed) lines.push(`  [done] ${s.slice.files[0]} — ${s.slice.intent}`)
  for (const s of r.failed) {
    lines.push(`  [FAIL] ${s.slice.files[0]} — ${s.slice.intent}`)
    if (s.output.trim().length > 0) for (const ln of s.output.trimEnd().split('\n')) lines.push(`    ${ln}`)
  }
  for (const s of r.skipped) lines.push(`  [skip] ${s.slice.files[0]} — ${s.slice.intent} (budget reached)`)
  lines.push('')
  lines.push('Review the working tree (git diff); /build never commits or pushes.')
  lines.push(`(model: ${plan.model} · in ${plan.tokensIn + r.tokensIn} · out ${plan.tokensOut + r.tokensOut})`)
  return lines.join('\n')
}

function emit(ctx: CommandContext, text: string, tone?: 'info' | 'warn'): void {
  if (ctx.ui) ctx.ui(tone ? { kind: 'note', tone, text } : { kind: 'note', text })
  else process.stdout.write(text + '\n')
}
