import { release, type, arch, platform } from 'node:os'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { CLI_NAME, CLI_VERSION } from '../../version'

export class VersionCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'version',
    aliases: ['v'],
    summary: 'Show CLI version and runtime',
  }

  async execute(_args: string[], ctx: CommandContext): Promise<boolean> {
    const rows = [
      { key: 'CLI', value: `${CLI_NAME} ${CLI_VERSION}` },
      { key: 'Runtime', value: detectRuntime() },
      { key: 'Node', value: process.version },
      { key: 'Platform', value: `${type()} ${release()}` },
      { key: 'OS', value: platform() },
      { key: 'Arch', value: arch() },
    ]

    if (ctx.ui) {
      ctx.ui({
        kind: 'card',
        title: `${capitalize(CLI_NAME)} ${CLI_VERSION}`,
        sections: [{ rows }],
      })
      return true
    }

    const w = Math.max(...rows.map((r) => r.key.length))
    const lines = rows.map((r) => `  ${r.key.padEnd(w)}  ${r.value}`)
    process.stdout.write(`${capitalize(CLI_NAME)} ${CLI_VERSION}\n${lines.join('\n')}\n`)
    return true
  }
}

function detectRuntime(): string {
  // Bun exposes `process.versions.bun`; Node doesn't.
  const bun = (process.versions as Record<string, string | undefined>).bun
  if (bun) return `bun ${bun}`
  return `node ${process.version.replace(/^v/, '')}`
}

function capitalize(s: string): string {
  if (s.length === 0) return s
  return s[0].toUpperCase() + s.slice(1)
}
