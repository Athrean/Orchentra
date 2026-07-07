import type { ToolDefinition, ToolRegistry } from '@orchentra/cli-core'
import { McpClient } from './client'
import type { McpHttpConfig, McpServerConfig } from './config'
import { parseMcpConfig, resolveHeaders } from './config'
import { buildMcpToolDefinition } from './bridge'
import { buildMcpToolSearchTool, MCP_TOOL_SEARCH_NAME } from './tool-search-tool'
import { totalSchemaTokens } from './tool-catalog'
import { HttpTransport } from './transport-http'
import { StdioTransport } from './transport-stdio'
import type { Transport } from './transport'

export type McpConnectionState = 'pending' | 'connecting' | 'connected' | 'failed' | 'closed'

export interface McpConnectionStatus {
  readonly name: string
  readonly transport: McpServerConfig['transport']
  readonly state: McpConnectionState
  readonly toolCount: number
  readonly error?: string
  readonly serverInfo?: { name: string; version: string }
}

interface ManagerEntry {
  readonly config: McpServerConfig
  readonly client: McpClient
  tools: ToolDefinition[]
  state: McpConnectionState
  error: string | undefined
  serverName: string | undefined
  serverVersion: string | undefined
}

export interface McpManagerOptions {
  readonly warnings: string[]
  readonly connectTimeoutMs?: number
  readonly onLog?: (level: 'info' | 'warn' | 'error', message: string) => void
}

export interface McpRegisterOptions {
  /** Defer tools behind a search surface once their schema cost exceeds this. */
  readonly deferOverTokens?: number
  /** Token estimator used to weigh the combined schema cost. */
  readonly estimateTokens?: (text: string) => number
}

const DEFAULT_CONNECT_TIMEOUT_MS = 10_000

export class McpManager {
  private readonly entries: ManagerEntry[]
  private readonly opts: McpManagerOptions
  private readonly connectTimeoutMs: number

  private constructor(entries: ManagerEntry[], opts: McpManagerOptions) {
    this.entries = entries
    this.opts = opts
    this.connectTimeoutMs = opts.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS
  }

  static fromRaw(raw: unknown, opts: Partial<McpManagerOptions> = {}): McpManager {
    const parsed = parseMcpConfig(raw)
    const entries: ManagerEntry[] = parsed.servers.map((config) => ({
      config,
      client: buildClient(config),
      tools: [],
      state: 'pending',
      error: undefined,
      serverName: undefined,
      serverVersion: undefined,
    }))
    return new McpManager(entries, {
      warnings: parsed.warnings,
      connectTimeoutMs: opts.connectTimeoutMs,
      onLog: opts.onLog,
    })
  }

  warnings(): string[] {
    return this.opts.warnings.slice()
  }

  async connectAll(): Promise<McpConnectionStatus[]> {
    for (const warn of this.opts.warnings) this.log('warn', `mcp config: ${warn}`)
    const results = await Promise.all(this.entries.map((entry) => this.connectOne(entry)))
    return results
  }

  private async connectOne(entry: ManagerEntry): Promise<McpConnectionStatus> {
    entry.state = 'connecting'
    const timer = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), this.connectTimeoutMs))
    try {
      const race = await Promise.race([entry.client.connect().then(() => 'ok' as const), timer])
      if (race === 'timeout') {
        throw new Error(`connect timed out after ${this.connectTimeoutMs}ms`)
      }
      const info = entry.client.serverInfo()
      if (info) {
        entry.serverName = info.serverInfo.name
        entry.serverVersion = info.serverInfo.version
      }
      const specs = await entry.client.listTools()
      entry.tools = specs.map((spec) =>
        buildMcpToolDefinition({
          serverName: entry.config.name,
          spec,
          client: entry.client,
          level: entry.config.defaultLevel,
          timeoutMs: entry.config.toolCallTimeoutMs,
        }),
      )
      entry.state = 'connected'
      this.log('info', `mcp ${entry.config.name}: connected (${entry.tools.length} tools)`)
    } catch (err) {
      entry.state = 'failed'
      entry.error = err instanceof Error ? err.message : String(err)
      this.log('warn', `mcp ${entry.config.name}: ${entry.error}`)
      try {
        await entry.client.close()
      } catch {
        /* ignore */
      }
    }
    return this.statusOf(entry)
  }

  /**
   * Register every connected MCP tool into the registry. When `deferOverTokens`
   * is set and the tools' combined schema cost exceeds it, register a single
   * `mcp_tool_search` surface instead — the model searches it and the matches
   * load on demand, keeping dozens of unused schemas out of every request.
   * Returns the number of registrations made (the search tool counts as one).
   */
  registerInto(registry: ToolRegistry, opts?: McpRegisterOptions): number {
    const connectedTools = this.entries.filter((entry) => entry.state === 'connected').flatMap((entry) => entry.tools)

    if (opts?.deferOverTokens !== undefined && opts.estimateTokens) {
      const tokens = totalSchemaTokens(connectedTools, opts.estimateTokens)
      if (tokens > opts.deferOverTokens && !registry.has(MCP_TOOL_SEARCH_NAME)) {
        registry.register(buildMcpToolSearchTool({ catalog: connectedTools, registry }))
        this.log(
          'info',
          `mcp: deferred ${connectedTools.length} tools behind ${MCP_TOOL_SEARCH_NAME} (~${tokens} tokens)`,
        )
        return 1
      }
    }

    let count = 0
    for (const entry of this.entries) {
      if (entry.state !== 'connected') continue
      for (const tool of entry.tools) {
        if (registry.has(tool.name)) {
          this.log('warn', `mcp ${entry.config.name}: skipping '${tool.name}' (already registered)`)
          continue
        }
        registry.register(tool)
        count++
      }
    }
    return count
  }

  statuses(): McpConnectionStatus[] {
    return this.entries.map((entry) => this.statusOf(entry))
  }

  toolsOf(serverName: string): ToolDefinition[] {
    const entry = this.entries.find((e) => e.config.name === serverName)
    return entry ? entry.tools.slice() : []
  }

  async shutdown(): Promise<void> {
    await Promise.all(
      this.entries.map(async (entry) => {
        try {
          await entry.client.close()
        } catch {
          /* ignore */
        }
        entry.state = 'closed'
      }),
    )
  }

  private statusOf(entry: ManagerEntry): McpConnectionStatus {
    return {
      name: entry.config.name,
      transport: entry.config.transport,
      state: entry.state,
      toolCount: entry.tools.length,
      error: entry.error,
      serverInfo:
        entry.serverName && entry.serverVersion ? { name: entry.serverName, version: entry.serverVersion } : undefined,
    }
  }

  private log(level: 'info' | 'warn' | 'error', message: string): void {
    this.opts.onLog?.(level, message)
  }
}

function buildClient(config: McpServerConfig): McpClient {
  const transport = buildTransport(config)
  return new McpClient({ transport, defaultTimeoutMs: config.toolCallTimeoutMs })
}

function buildTransport(config: McpServerConfig): Transport {
  if (config.transport === 'stdio') {
    return new StdioTransport({
      command: config.command,
      args: config.args,
      env: config.env,
    })
  }
  const httpConfig: McpHttpConfig = config
  const lazyHeaders = httpConfig.headersHelper ? undefined : httpConfig.headers
  if (lazyHeaders) {
    return new HttpTransport({ url: httpConfig.url, headers: lazyHeaders })
  }
  return new LazyHeaderHttpTransport(httpConfig)
}

class LazyHeaderHttpTransport implements Transport {
  private readonly config: McpHttpConfig
  private inner: HttpTransport | null = null

  constructor(config: McpHttpConfig) {
    this.config = config
  }

  async start(): Promise<void> {
    const headers = await resolveHeaders(this.config)
    this.inner = new HttpTransport({ url: this.config.url, headers })
    await this.inner.start()
  }

  send: HttpTransport['send'] = (...args) => {
    if (!this.inner) throw new Error('LazyHeaderHttpTransport: not started')
    return this.inner.send(...args)
  }

  sendNotification: HttpTransport['sendNotification'] = (...args) => {
    if (!this.inner) throw new Error('LazyHeaderHttpTransport: not started')
    return this.inner.sendNotification(...args)
  }

  async close(): Promise<void> {
    if (this.inner) await this.inner.close()
  }

  status(): ReturnType<HttpTransport['status']> {
    return this.inner?.status() ?? { state: 'idle' }
  }
}
