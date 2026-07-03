import { spawnSync } from 'node:child_process'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import type { UiCardSection } from '../ui-output'

export class LeanCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'lean',
    aliases: [],
    summary: 'Inspect the working tree for bloat and optionally request simplification',
    argumentHint: '[--fix] [--path <path>]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const fix = args.includes('--fix')
    const path = pathArg(args)
    if (fix) return requestFix(ctx, path)
    const report = inspectDiff(ctx.cwd, path)
    if (report instanceof Error) return note(ctx, report.message, 'warn')
    return showReport(ctx, report)
  }
}

interface LeanReport {
  files: number
  added: number
  removed: number
  newDependencies: string[]
  riskMarkers: string[]
}

async function requestFix(ctx: CommandContext, path: string | undefined): Promise<boolean> {
  if (!ctx.runTurn) return note(ctx, '/lean --fix needs an interactive runtime session.', 'warn')
  const scope = path ? `Path scope: ${path}` : 'Scope: current working-tree diff'
  await ctx.runTurn(
    [
      'Run a lean-code pass on this workspace.',
      scope,
      'Use the lean ladder: does it need to exist? -> stdlib -> native platform -> existing dependency -> one line -> minimum custom code.',
      'Inspect before editing. Remove only bloat introduced by the current task. Preserve behavior and tests. Do not commit or push.',
    ].join('\n'),
  )
  return note(ctx, 'Lean simplification turn started.')
}

function inspectDiff(cwd: string, path: string | undefined): LeanReport | Error {
  const args = ['diff', '--numstat', '--']
  if (path) args.push(path)
  const stat = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 5000, env: cleanGitEnv() })
  if (stat.status !== 0) return new Error(`git diff failed: ${stat.stderr || stat.stdout || 'unknown'}`)

  const patchArgs = ['diff', '--']
  if (path) patchArgs.push(path)
  const patch = spawnSync('git', patchArgs, { cwd, encoding: 'utf8', timeout: 5000, env: cleanGitEnv() })
  if (patch.status !== 0) return new Error(`git diff failed: ${patch.stderr || patch.stdout || 'unknown'}`)

  let files = 0
  let added = 0
  let removed = 0
  for (const line of stat.stdout.split('\n')) {
    if (!line.trim()) continue
    const [a, r] = line.split('\t')
    files++
    added += numericStat(a)
    removed += numericStat(r)
  }

  return {
    files,
    added,
    removed,
    newDependencies: dependencyAdds(patch.stdout),
    riskMarkers: riskMarkers(patch.stdout),
  }
}

function dependencyAdds(diff: string): string[] {
  const deps: string[] = []
  let inPackage = false
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) inPackage = line.includes('package.json')
    if (!inPackage || !line.startsWith('+') || line.startsWith('+++')) continue
    const match = line.match(/^\+\s+"([^"]+)":\s+"[^"]+"/)
    if (match) deps.push(match[1])
  }
  return Array.from(new Set(deps)).sort()
}

function riskMarkers(diff: string): string[] {
  const markers = [
    { label: 'type escapes', pattern: /\bas\s+any\b|:\s*any\b/ },
    { label: 'disabled checks', pattern: /eslint-disable|ts-ignore|ts-expect-error/ },
    { label: 'debug output', pattern: /console\.log|debugger/ },
    { label: 'speculative naming', pattern: /\b(manager|factory|orchestrator|adapter)\b/i },
  ]
  const out: string[] = []
  for (const marker of markers) {
    if (diff.split('\n').some((line) => line.startsWith('+') && marker.pattern.test(line))) out.push(marker.label)
  }
  return out
}

function showReport(ctx: CommandContext, report: LeanReport): boolean {
  const sections: UiCardSection[] = [
    {
      title: 'Diff shape',
      rows: [
        { key: 'Changed files', value: String(report.files) },
        { key: 'Added lines', value: String(report.added) },
        { key: 'Removed lines', value: String(report.removed) },
      ],
    },
    {
      title: 'Lean risks',
      rows: [
        {
          key: 'New dependencies',
          value: report.newDependencies.length === 0 ? 'none' : report.newDependencies.join(', '),
        },
        { key: 'Markers', value: report.riskMarkers.length === 0 ? 'none' : report.riskMarkers.join(', ') },
      ],
    },
  ]
  if (ctx.ui) ctx.ui({ kind: 'card', title: 'Lean', subtitle: 'Working-tree inspection', sections })
  else process.stdout.write(renderPlain(sections))
  return true
}

function pathArg(args: readonly string[]): string | undefined {
  const idx = args.indexOf('--path')
  return idx >= 0 ? args[idx + 1] : undefined
}

function numericStat(value: string | undefined): number {
  if (!value || value === '-') return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function cleanGitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith('GIT_')) env[key] = value
  }
  return env
}

function note(ctx: CommandContext, text: string, tone: 'info' | 'warn' = 'info'): boolean {
  if (ctx.ui) ctx.ui({ kind: 'note', text, tone })
  else {
    const stream = tone === 'warn' ? process.stderr : process.stdout
    stream.write(text + '\n')
  }
  return tone !== 'warn'
}

function renderPlain(sections: readonly UiCardSection[]): string {
  const lines = ['Lean']
  for (const section of sections) {
    if (section.title) lines.push('', section.title)
    const width = Math.max(...section.rows.map((row) => row.key.length))
    for (const row of section.rows) lines.push(`  ${row.key.padEnd(width)}  ${row.value}`)
  }
  return lines.join('\n') + '\n'
}
