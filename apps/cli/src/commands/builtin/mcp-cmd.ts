import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { ConfigLoader } from '@orchentra/cli-core'
import { THEME } from '../../tui/theme'
import type { UiKVRow } from '../ui-output'

export class McpCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'mcp',
    aliases: [],
    summary: 'Show MCP server configuration',
  }

  async execute(_args: string[], ctx: CommandContext): Promise<boolean> {
    const config = ConfigLoader.defaultFor(ctx.cwd).load()
    const rawMcp = (config.merged as Record<string, unknown>).mcp
    const mcp = (rawMcp && typeof rawMcp === 'object' ? rawMcp : {}) as { servers?: Record<string, unknown> }
    const servers = mcp.servers ?? {}
    const names = Object.keys(servers)

    if (ctx.ui) {
      if (names.length === 0) {
        ctx.ui({
          kind: 'card',
          title: 'MCP servers',
          subtitle: '0 configured',
          sections: [
            {
              rows: [
                {
                  key: 'Hint',
                  value: 'Add servers under "mcp.servers" in .orchentra/settings.json',
                  valueColor: THEME.muted,
                },
              ],
            },
          ],
        })
      } else {
        const rows: UiKVRow[] = names.map((name) => describeServer(name, servers[name]))
        ctx.ui({
          kind: 'card',
          title: 'MCP servers',
          subtitle: `${names.length} configured`,
          sections: [{ rows }],
        })
      }
      return true
    }

    if (names.length === 0) {
      process.stdout.write('No MCP servers configured.\nAdd servers to .orchentra/settings.json under "mcp.servers".\n')
      return true
    }
    const lines: string[] = [`MCP servers (${names.length}):`]
    for (const name of names) {
      const row = describeServer(name, servers[name])
      lines.push(`  ${name.padEnd(20)}  ${row.value}`)
    }
    process.stdout.write(lines.join('\n') + '\n')
    return true
  }
}

function describeServer(name: string, raw: unknown): UiKVRow {
  const server = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const transport = 'command' in server ? 'stdio' : 'url' in server ? 'http' : 'unknown'
  const detail =
    transport === 'stdio'
      ? (server.command as string | undefined)
      : transport === 'http'
        ? (server.url as string | undefined)
        : undefined
  return {
    key: name,
    value: `${transport.padEnd(7)}  ${detail ?? '?'}`,
    valueColor: transport === 'unknown' ? THEME.warn : undefined,
  }
}
