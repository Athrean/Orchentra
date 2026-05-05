import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export interface BuildOptions {
  /** Hosted MCP HTTP endpoint URL. */
  url: string
  /** Org id sent on every request via x-orchentra-org. */
  orgId: string
  /** Bearer token. Optional — if omitted, downstream tools prompt later. */
  token?: string
  /** Override the server entry name (defaults to `orchentra`). */
  serverName?: string
}

export interface McpServerEntry {
  type: 'http'
  url: string
  headers: Record<string, string>
}

export interface McpConfig {
  mcpServers: Record<string, McpServerEntry>
}

/**
 * Build the canonical Claude Desktop / Cursor `mcpServers` config entry that
 * points at a hosted Orchentra MCP endpoint. The shape mirrors what those
 * clients consume verbatim:
 *
 *   { "mcpServers": { "orchentra": { "type": "http", "url": "...", "headers": { ... } } } }
 *
 * `Authorization` is only set when a token is supplied; the org header is
 * always set so the host can attribute the request.
 */
export function buildMcpServerConfig(opts: BuildOptions): McpConfig {
  const url = opts.url.trim()
  if (url.length === 0) throw new Error('url is required')
  const orgId = opts.orgId.trim()
  if (orgId.length === 0) throw new Error('orgId is required')

  const headers: Record<string, string> = { 'x-orchentra-org': orgId }
  const token = opts.token?.trim()
  if (token && token.length > 0) {
    headers.Authorization = `Bearer ${token}`
  }

  const name = opts.serverName?.trim() || 'orchentra'

  return {
    mcpServers: {
      [name]: { type: 'http', url, headers },
    },
  }
}

/** Pretty-printed JSON snippet suitable for printing or pasting into a config file. */
export function renderConfigSnippet(cfg: McpConfig): string {
  return JSON.stringify(cfg, null, 2)
}

export interface WriteOptions {
  /** Overwrite an existing file at the path. Defaults to false (throws). */
  overwrite?: boolean
}

/**
 * Persist the config to a JSON file. Creates parent directories if needed.
 * Returns the absolute path written to.
 */
export function writeConfigFile(path: string, cfg: McpConfig, opts: WriteOptions = {}): string {
  const abs = resolve(path)
  if (existsSync(abs) && opts.overwrite !== true) {
    throw new Error(`config file already exists at ${abs} (pass --write --overwrite to replace)`)
  }
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, renderConfigSnippet(cfg) + '\n', 'utf-8')
  return abs
}
