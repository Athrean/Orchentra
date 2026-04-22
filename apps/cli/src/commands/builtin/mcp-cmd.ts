import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { ConfigLoader } from '@orchentra/cli-core'

export class McpCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'mcp',
    aliases: [],
    summary: 'Show MCP server configuration',
  }

  async execute(_args: string[], ctx: CommandContext): Promise<boolean> {
    const config = ConfigLoader.defaultFor(ctx.cwd).load()
    const rawMcp = (config.merged as Record<string, unknown>).mcp

    if (!rawMcp || typeof rawMcp !== 'object') {
      process.stdout.write('No MCP servers configured.\nAdd servers to .orchentra/settings.json under "mcp.servers".\n')
      return true
    }

    const mcp = rawMcp as { servers?: Record<string, unknown> }
    const servers = mcp.servers ?? {}
    const names = Object.keys(servers)

    if (names.length === 0) {
      process.stdout.write('No MCP servers configured.\n')
      return true
    }

    process.stdout.write(`MCP servers (${names.length}):\n`)
    for (const name of names) {
      const server = servers[name] as Record<string, unknown>
      const type = 'command' in server ? 'stdio' : 'url' in server ? 'http' : 'unknown'
      const detail = type === 'stdio' ? (server as { command?: string }).command : (server as { url?: string }).url
      process.stdout.write(`  ${name} (${type}) — ${detail ?? '?'}\n`)
    }
    return true
  }
}
