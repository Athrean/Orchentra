import { describe, expect, test } from 'bun:test'
import { parseMcpConfig, substituteEnv } from '../src/mcp/config'

describe('parseMcpConfig', () => {
  test('returns empty when no input', () => {
    expect(parseMcpConfig(undefined).servers).toEqual([])
    expect(parseMcpConfig(null).servers).toEqual([])
    expect(parseMcpConfig({}).servers).toEqual([])
  })

  test('parses a complete stdio entry', () => {
    const result = parseMcpConfig({
      servers: {
        github: {
          transport: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          env: { GITHUB_TOKEN: 'literal' },
          toolCallTimeoutMs: 5000,
          defaultLevel: 'write',
        },
      },
    })
    expect(result.warnings).toEqual([])
    expect(result.servers.length).toBe(1)
    const server = result.servers[0]
    expect(server.name).toBe('github')
    expect(server.transport).toBe('stdio')
    if (server.transport !== 'stdio') throw new Error('expected stdio')
    expect(server.command).toBe('npx')
    expect(server.args).toEqual(['-y', '@modelcontextprotocol/server-github'])
    expect(server.env.GITHUB_TOKEN).toBe('literal')
    expect(server.toolCallTimeoutMs).toBe(5000)
    expect(server.defaultLevel).toBe('write')
  })

  test('parses a complete http entry and defaults', () => {
    const result = parseMcpConfig({
      servers: {
        linear: {
          transport: 'http',
          url: 'https://mcp.linear.app/mcp',
          headers: { Authorization: 'Bearer abc' },
        },
      },
    })
    expect(result.servers.length).toBe(1)
    const server = result.servers[0]
    if (server.transport !== 'http') throw new Error('expected http')
    expect(server.url).toBe('https://mcp.linear.app/mcp')
    expect(server.headers.Authorization).toBe('Bearer abc')
    expect(server.headersHelper).toBeNull()
    expect(server.toolCallTimeoutMs).toBe(60_000)
    expect(server.defaultLevel).toBe('write')
  })

  test('rejects entries with invalid transport without throwing', () => {
    const result = parseMcpConfig({ servers: { bad: { transport: 'quic' } } })
    expect(result.servers.length).toBe(0)
    expect(result.warnings.some((w) => w.includes('bad') && w.includes('transport'))).toBe(true)
  })

  test('rejects stdio without command', () => {
    const result = parseMcpConfig({ servers: { bad: { transport: 'stdio' } } })
    expect(result.servers.length).toBe(0)
    expect(result.warnings.some((w) => w.includes('command'))).toBe(true)
  })

  test('rejects http with bad url', () => {
    const result = parseMcpConfig({ servers: { bad: { transport: 'http', url: 'ftp://x' } } })
    expect(result.servers.length).toBe(0)
    expect(result.warnings.some((w) => w.includes('url'))).toBe(true)
  })

  test('warns on http non-localhost but keeps entry', () => {
    const result = parseMcpConfig({ servers: { ok: { transport: 'http', url: 'http://example.com' } } })
    expect(result.servers.length).toBe(1)
    expect(result.warnings.some((w) => w.includes('http://'))).toBe(true)
  })

  test('caps absurd timeouts and warns', () => {
    const result = parseMcpConfig({
      servers: {
        slow: { transport: 'http', url: 'https://x.example', toolCallTimeoutMs: 10_000_000 },
      },
    })
    if (result.servers[0].transport !== 'http') throw new Error('expected http')
    expect(result.servers[0].toolCallTimeoutMs).toBe(600_000)
    expect(result.warnings.some((w) => w.includes('capped'))).toBe(true)
  })

  test('defaults level to write when invalid', () => {
    const result = parseMcpConfig({
      servers: { x: { transport: 'http', url: 'https://x', defaultLevel: 'superuser' } },
    })
    expect(result.servers[0].defaultLevel).toBe('write')
    expect(result.warnings.some((w) => w.includes('defaultLevel'))).toBe(true)
  })
})

describe('substituteEnv', () => {
  test('replaces ${env:FOO} tokens', () => {
    expect(substituteEnv('x=${env:FOO}', { FOO: '1' })).toBe('x=1')
  })
  test('leaves unknown tokens empty', () => {
    expect(substituteEnv('x=${env:MISSING}', {})).toBe('x=')
  })
  test('ignores non-matching patterns', () => {
    expect(substituteEnv('${literal}', { literal: 'nope' })).toBe('${literal}')
  })
})
