import { ConfigLoader } from '@orchentra/cli-core'
import { McpManager, type McpConnectionStatus } from '@orchentra/cli-tools'

export async function runMcpList(cwd: string = process.cwd()): Promise<number> {
  const manager = buildManager(cwd)
  const statuses = await manager.connectAll()
  const tools = gatherTools(manager)
  try {
    if (statuses.length === 0) {
      process.stdout.write('no MCP servers configured. add entries under "mcp.servers" in .orchentra/settings.json\n')
      return 0
    }
    for (const status of statuses) {
      process.stdout.write(renderStatus(status))
    }
    for (const line of tools) process.stdout.write(line)
    return statuses.every((s) => s.state === 'connected') ? 0 : 2
  } finally {
    await manager.shutdown()
  }
}

export async function runMcpTest(name: string, cwd: string = process.cwd()): Promise<number> {
  const manager = buildManager(cwd)
  const statuses = await manager.connectAll()
  try {
    const match = statuses.find((s) => s.name === name)
    if (!match) {
      process.stdout.write(
        `mcp test: no server named '${name}'. configured: ${statuses.map((s) => s.name).join(', ') || '(none)'}\n`,
      )
      return 1
    }
    process.stdout.write(renderStatus(match))
    if (match.state !== 'connected') {
      return 1
    }
    for (const line of gatherTools(manager, name)) process.stdout.write(line)
    return 0
  } finally {
    await manager.shutdown()
  }
}

function buildManager(cwd: string): McpManager {
  const config = ConfigLoader.defaultFor(cwd).load()
  const rawMcp = (config.merged as Record<string, unknown>).mcp
  return McpManager.fromRaw(rawMcp, {
    onLog: (level, message) => {
      process.stderr.write(`[mcp] ${level}: ${message}\n`)
    },
  })
}

function renderStatus(status: McpConnectionStatus): string {
  const marker = statusMarker(status.state)
  const info = status.serverInfo ? ` — ${status.serverInfo.name} v${status.serverInfo.version}` : ''
  const err = status.error ? ` (${status.error})` : ''
  return `${marker} ${status.name} [${status.transport}] ${status.state} — ${status.toolCount} tools${info}${err}\n`
}

function statusMarker(state: McpConnectionStatus['state']): string {
  switch (state) {
    case 'connected':
      return '+'
    case 'failed':
      return 'x'
    case 'pending':
    case 'connecting':
      return '.'
    case 'closed':
      return '-'
    default:
      return '?'
  }
}

function gatherTools(manager: McpManager, filterServer?: string): string[] {
  const out: string[] = []
  for (const status of manager.statuses()) {
    if (filterServer && status.name !== filterServer) continue
    if (status.state !== 'connected' || status.toolCount === 0) continue
    out.push(`  tools from ${status.name}:\n`)
    for (const tool of manager.toolsOf(status.name)) {
      out.push(`    - ${tool.name}\n`)
    }
  }
  return out
}
