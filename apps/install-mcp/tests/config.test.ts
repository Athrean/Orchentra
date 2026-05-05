import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildMcpServerConfig, renderConfigSnippet, writeConfigFile } from '../src/config'

describe('buildMcpServerConfig', () => {
  test('emits the canonical Claude Desktop / Cursor MCP server entry shape', () => {
    const cfg = buildMcpServerConfig({
      url: 'https://mcp-host.orchentra.dev/mcp',
      token: 'secret-token',
      orgId: 'org_abc',
    })

    expect(cfg.mcpServers.orchentra).toMatchObject({
      type: 'http',
      url: 'https://mcp-host.orchentra.dev/mcp',
      headers: {
        Authorization: 'Bearer secret-token',
        'x-orchentra-org': 'org_abc',
      },
    })
  })

  test('omits Authorization when no token is provided (server prompts later)', () => {
    const cfg = buildMcpServerConfig({
      url: 'https://mcp-host.orchentra.dev/mcp',
      orgId: 'org_abc',
    })

    expect(cfg.mcpServers.orchentra.headers).toEqual({
      'x-orchentra-org': 'org_abc',
    })
  })

  test('rejects empty url', () => {
    expect(() => buildMcpServerConfig({ url: '', orgId: 'org_abc' })).toThrow(/url/i)
  })

  test('rejects empty orgId', () => {
    expect(() => buildMcpServerConfig({ url: 'https://mcp-host.orchentra.dev/mcp', orgId: '' })).toThrow(/org/i)
  })
})

describe('renderConfigSnippet', () => {
  test('produces JSON that round-trips and parses to the expected shape', () => {
    const cfg = buildMcpServerConfig({ url: 'https://x', orgId: 'org_abc' })
    const snippet = renderConfigSnippet(cfg)

    const parsed = JSON.parse(snippet) as { mcpServers: { orchentra: { url: string } } }
    expect(parsed.mcpServers.orchentra.url).toBe('https://x')
  })

  test('snippet is pretty-printed (multi-line) for human consumption', () => {
    const cfg = buildMcpServerConfig({ url: 'https://x', orgId: 'org_abc' })
    const snippet = renderConfigSnippet(cfg)

    expect(snippet.includes('\n')).toBe(true)
  })
})

describe('writeConfigFile', () => {
  test('writes the snippet to the supplied path and returns the absolute path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'install-mcp-'))
    const target = join(dir, 'mcp.json')
    const cfg = buildMcpServerConfig({ url: 'https://x', orgId: 'org_abc' })

    const written = writeConfigFile(target, cfg)

    expect(written).toBe(target)
    expect(existsSync(target)).toBe(true)
    const content = readFileSync(target, 'utf-8')
    expect(JSON.parse(content)).toEqual(cfg as unknown as Record<string, unknown>)
  })

  test('refuses to overwrite an existing file unless overwrite is true', () => {
    const dir = mkdtempSync(join(tmpdir(), 'install-mcp-'))
    const target = join(dir, 'mcp.json')
    const cfg = buildMcpServerConfig({ url: 'https://x', orgId: 'org_abc' })
    writeConfigFile(target, cfg)

    expect(() => writeConfigFile(target, cfg)).toThrow(/exists/i)

    // overwrite: true succeeds
    expect(() => writeConfigFile(target, cfg, { overwrite: true })).not.toThrow()
  })
})
