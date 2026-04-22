import type { ToolLevel } from '@orchentra/cli-core'

export type McpTransport = 'stdio' | 'http'

export interface McpStdioConfig {
  readonly name: string
  readonly transport: 'stdio'
  readonly command: string
  readonly args: string[]
  readonly env: Record<string, string>
  readonly toolCallTimeoutMs: number
  readonly defaultLevel: ToolLevel
}

export interface McpHttpConfig {
  readonly name: string
  readonly transport: 'http'
  readonly url: string
  readonly headers: Record<string, string>
  readonly headersHelper: string | null
  readonly toolCallTimeoutMs: number
  readonly defaultLevel: ToolLevel
}

export type McpServerConfig = McpStdioConfig | McpHttpConfig

export interface McpConfigParseResult {
  readonly servers: McpServerConfig[]
  readonly warnings: string[]
}

const DEFAULT_TIMEOUT_MS = 60_000
const MAX_TIMEOUT_MS = 10 * 60_000
const DEFAULT_LEVEL: ToolLevel = 'write'
const VALID_LEVELS: ReadonlySet<ToolLevel> = new Set<ToolLevel>(['read', 'write', 'admin'])

export function parseMcpConfig(raw: unknown): McpConfigParseResult {
  const warnings: string[] = []
  if (raw === undefined || raw === null) return { servers: [], warnings }
  if (!isObject(raw)) {
    warnings.push('mcp: expected object, got ' + typeName(raw))
    return { servers: [], warnings }
  }

  const serversRaw = raw.servers
  if (serversRaw === undefined) return { servers: [], warnings }
  if (!isObject(serversRaw)) {
    warnings.push('mcp.servers: expected object, got ' + typeName(serversRaw))
    return { servers: [], warnings }
  }

  const servers: McpServerConfig[] = []
  for (const [name, entry] of Object.entries(serversRaw)) {
    const parsed = parseServerEntry(name, entry, warnings)
    if (parsed) servers.push(parsed)
  }
  return { servers, warnings }
}

function parseServerEntry(name: string, raw: unknown, warnings: string[]): McpServerConfig | null {
  if (!isObject(raw)) {
    warnings.push(`mcp.servers.${name}: expected object, got ${typeName(raw)}`)
    return null
  }
  const transport = raw.transport
  if (transport !== 'stdio' && transport !== 'http') {
    warnings.push(`mcp.servers.${name}: transport must be "stdio" or "http"`)
    return null
  }

  const timeout = coerceTimeout(raw.toolCallTimeoutMs, name, warnings)
  const level = coerceLevel(raw.defaultLevel, name, warnings)

  if (transport === 'stdio') {
    const command = raw.command
    if (typeof command !== 'string' || command.length === 0) {
      warnings.push(`mcp.servers.${name}: stdio transport requires a non-empty "command"`)
      return null
    }
    return {
      name,
      transport: 'stdio',
      command,
      args: toStringArray(raw.args, `mcp.servers.${name}.args`, warnings),
      env: substituteEnvMap(
        toStringMap(raw.env, `mcp.servers.${name}.env`, warnings),
        warnings,
        `mcp.servers.${name}.env`,
      ),
      toolCallTimeoutMs: timeout,
      defaultLevel: level,
    }
  }

  const url = raw.url
  if (typeof url !== 'string' || url.length === 0) {
    warnings.push(`mcp.servers.${name}: http transport requires a non-empty "url"`)
    return null
  }
  if (!/^https?:\/\//.test(url)) {
    warnings.push(`mcp.servers.${name}: url must start with http:// or https://`)
    return null
  }
  if (url.startsWith('http://') && !isLocalhost(url)) {
    warnings.push(`mcp.servers.${name}: http:// against non-localhost is unsafe — prefer https`)
  }
  return {
    name,
    transport: 'http',
    url,
    headers: substituteEnvMap(
      toStringMap(raw.headers, `mcp.servers.${name}.headers`, warnings),
      warnings,
      `mcp.servers.${name}.headers`,
    ),
    headersHelper: typeof raw.headersHelper === 'string' ? raw.headersHelper : null,
    toolCallTimeoutMs: timeout,
    defaultLevel: level,
  }
}

export async function resolveHeaders(config: McpHttpConfig): Promise<Record<string, string>> {
  const resolved: Record<string, string> = { ...config.headers }
  if (!config.headersHelper) return resolved
  const proc = Bun.spawn(['sh', '-c', config.headersHelper], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const exit = await proc.exited
  if (exit !== 0) {
    const errText = await new Response(proc.stderr).text()
    throw new Error(`headersHelper exited ${exit}: ${errText.trim()}`)
  }
  const stdout = await new Response(proc.stdout).text()
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (key.length > 0) resolved[key] = value
  }
  return resolved
}

function coerceTimeout(raw: unknown, name: string, warnings: string[]): number {
  if (raw === undefined) return DEFAULT_TIMEOUT_MS
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    warnings.push(`mcp.servers.${name}.toolCallTimeoutMs: must be positive number, using default`)
    return DEFAULT_TIMEOUT_MS
  }
  if (raw > MAX_TIMEOUT_MS) {
    warnings.push(`mcp.servers.${name}.toolCallTimeoutMs: capped at ${MAX_TIMEOUT_MS}ms`)
    return MAX_TIMEOUT_MS
  }
  return Math.floor(raw)
}

function coerceLevel(raw: unknown, name: string, warnings: string[]): ToolLevel {
  if (raw === undefined) return DEFAULT_LEVEL
  if (typeof raw !== 'string' || !VALID_LEVELS.has(raw as ToolLevel)) {
    warnings.push(`mcp.servers.${name}.defaultLevel: must be read|write|admin, using "${DEFAULT_LEVEL}"`)
    return DEFAULT_LEVEL
  }
  return raw as ToolLevel
}

function toStringArray(raw: unknown, path: string, warnings: string[]): string[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    warnings.push(`${path}: expected array of strings`)
    return []
  }
  const out: string[] = []
  for (const v of raw) {
    if (typeof v === 'string') out.push(v)
    else warnings.push(`${path}: skipped non-string entry`)
  }
  return out
}

function toStringMap(raw: unknown, path: string, warnings: string[]): Record<string, string> {
  if (raw === undefined) return {}
  if (!isObject(raw)) {
    warnings.push(`${path}: expected object of string values`)
    return {}
  }
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string') out[k] = v
    else warnings.push(`${path}.${k}: expected string value`)
  }
  return out
}

export function substituteEnv(value: string, env: Record<string, string | undefined> = process.env): string {
  return value.replace(/\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, key: string) => env[key] ?? '')
}

function substituteEnvMap(
  input: Record<string, string>,
  warnings: string[],
  path: string,
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input)) {
    const substituted = substituteEnv(v, env)
    if (substituted !== v && substituted.length === 0) {
      warnings.push(`${path}.${k}: env substitution produced empty string`)
    }
    out[k] = substituted
  }
  return out
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function typeName(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function isLocalhost(url: string): boolean {
  try {
    const u = new URL(url)
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1'
  } catch {
    return false
  }
}
