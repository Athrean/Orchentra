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
}

const GAP = '  '

export function renderWelcomeBanner(opts: BannerOptions): string {
  const ctx = detectRenderContext()
  const mascotLines = renderMascot(ctx.mode)
  const title = style(cap(opts.cliName), BOLD, ctx.mode)
  const version = ctx.mode === 'none' ? ` v${opts.cliVersion}` : `${DIM} v${opts.cliVersion}${RESET}`
  const infoLines = [
    `${title}${version}`,
    style(`${opts.model} · ${opts.permissionMode}`, DIM, ctx.mode),
    style(prettyCwd(opts.cwd), DIM, ctx.mode),
  ]
  const rows = Math.max(mascotLines.length, infoLines.length)
  const out: string[] = []
  const pad = ' '.repeat(mascotWidthCols())
  for (let i = 0; i < rows; i++) {
    const left = mascotLines[i] ?? pad
    const right = infoLines[i] ?? ''
    out.push(`${left}${GAP}${right}`)
  }
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
