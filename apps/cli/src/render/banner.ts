import { homedir } from 'node:os'
import type { PermissionMode } from '@orchentra/cli-core'
import { BOLD, DIM, RESET, detectRenderContext, style } from './ansi'
import { mascotWidthCols, renderMascot } from './mascot'

export interface BannerOptions {
  readonly cliName: string
  readonly cliVersion: string
  readonly model: string
  readonly permissionMode: PermissionMode
  readonly cwd: string
  readonly branch?: string
  readonly workspaceStatus?: string
  readonly sessionId?: string
  readonly sessionPath?: string
  readonly providerName?: string
}

const GAP = '  '
const LABEL_WIDTH = 13

export function renderWelcomeBanner(opts: BannerOptions): string {
  const ctx = detectRenderContext()
  const mascotLines = renderMascot(ctx.mode)
  const title = style(cap(opts.cliName), BOLD, ctx.mode)
  const version = ctx.mode === 'none' ? ` v${opts.cliVersion}` : `${DIM} v${opts.cliVersion}${RESET}`
  const headerLines = [`${title}${version}`, style('Code', DIM, ctx.mode)]
  const rows = Math.max(mascotLines.length, headerLines.length)
  const out: string[] = []
  const pad = ' '.repeat(mascotWidthCols())
  for (let i = 0; i < rows; i++) {
    const left = mascotLines[i] ?? pad
    const right = headerLines[i] ?? ''
    out.push(`${left}${GAP}${right}`)
  }
  out.push('')

  const rowsInfo: Array<[string, string]> = [
    ['Model', opts.model],
    ['Permissions', opts.permissionMode],
    ['Branch', opts.branch ?? 'unknown'],
    ['Workspace', opts.workspaceStatus ?? 'unknown'],
    ['Directory', prettyCwd(opts.cwd)],
    ['Session', opts.sessionId ?? '-'],
    ['Auto-save', opts.sessionPath ? prettyPath(opts.sessionPath, opts.cwd) : '-'],
  ]
  for (const [label, value] of rowsInfo) {
    const paddedLabel = label.padEnd(LABEL_WIDTH, ' ')
    out.push(`  ${style(paddedLabel, DIM, ctx.mode)} ${value}`)
  }
  out.push('')

  const hint = [
    `Type ${style('/help', BOLD, ctx.mode)} for commands`,
    `${style('/status', BOLD, ctx.mode)} for live context`,
    `${style('/resume latest', DIM, ctx.mode)} jumps back to the newest session`,
    `${style('/diff', BOLD, ctx.mode)} then ${style('/commit', BOLD, ctx.mode)} to ship`,
    `${style('Tab', DIM, ctx.mode)} for workflow completions`,
    `${style('Shift+Enter', DIM, ctx.mode)} for newline`,
  ].join(' · ')
  out.push(`  ${hint}`)
  out.push(`  Connected: ${opts.model} via ${opts.providerName ?? 'anthropic'}`)

  return out.join('\n') + '\n'
}

function cap(value: string): string {
  if (value.length === 0) return value
  return value[0].toUpperCase() + value.slice(1)
}

function prettyCwd(cwd: string): string {
  const home = homedir()
  if (home && cwd === home) return '~'
  if (home && cwd.startsWith(`${home}/`)) return `~${cwd.slice(home.length)}`
  return cwd
}

function prettyPath(path: string, cwd: string): string {
  if (cwd && path.startsWith(`${cwd}/`)) return path.slice(cwd.length + 1)
  return prettyCwd(path)
}
