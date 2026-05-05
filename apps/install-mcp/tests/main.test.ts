import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs, run } from '../src/main'

class StringSink {
  out = ''
  write(s: string): void {
    this.out += s
  }
}

describe('parseArgs', () => {
  test('parses --url, --org, --token, --write, --overwrite', () => {
    const args = parseArgs([
      '--url',
      'https://x',
      '--org',
      'org_abc',
      '--token',
      'tok',
      '--write',
      '/tmp/cfg.json',
      '--overwrite',
    ])

    expect(args.url).toBe('https://x')
    expect(args.orgId).toBe('org_abc')
    expect(args.token).toBe('tok')
    expect(args.write).toBe('/tmp/cfg.json')
    expect(args.overwrite).toBe(true)
  })

  test('--help short form', () => {
    expect(parseArgs(['-h']).help).toBe(true)
    expect(parseArgs(['--help']).help).toBe(true)
  })
})

describe('run', () => {
  test('prints valid JSON config snippet to stdout when no --write is given', async () => {
    const sink = new StringSink()
    const code = await run(['--url', 'https://mcp-host', '--org', 'org_abc', '--token', 'tk'], sink)

    expect(code).toBe(0)
    const parsed = JSON.parse(sink.out) as {
      mcpServers: { orchentra: { url: string; headers: Record<string, string> } }
    }
    expect(parsed.mcpServers.orchentra.url).toBe('https://mcp-host')
    expect(parsed.mcpServers.orchentra.headers.Authorization).toBe('Bearer tk')
    expect(parsed.mcpServers.orchentra.headers['x-orchentra-org']).toBe('org_abc')
  })

  test('writes config to disk when --write is supplied', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'install-mcp-main-'))
    const target = join(dir, 'mcp.json')
    const sink = new StringSink()

    const code = await run(['--url', 'https://x', '--org', 'org_abc', '--write', target], sink)

    expect(code).toBe(0)
    expect(sink.out).toContain(target)
    const parsed = JSON.parse(readFileSync(target, 'utf-8')) as { mcpServers: Record<string, unknown> }
    expect(parsed.mcpServers.orchentra).toBeDefined()
  })

  test('exits with non-zero when --url or --org is missing', async () => {
    const sink = new StringSink()

    const code = await run(['--url', 'https://x'], sink)

    expect(code).not.toBe(0)
  })

  test('--help prints usage and exits 0', async () => {
    const sink = new StringSink()

    const code = await run(['--help'], sink)

    expect(code).toBe(0)
    expect(sink.out).toContain('--url')
    expect(sink.out).toContain('--org')
  })
})
