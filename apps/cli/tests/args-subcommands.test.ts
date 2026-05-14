import { describe, expect, test } from 'bun:test'
import { parseArgs, renderHelp } from '../src/args'

describe('parseArgs — subcommands', () => {
  test('investigate spec', () => {
    const result = parseArgs(['bun', 'orchentra', 'investigate', 'acme/api#42'])
    expect(result).toMatchObject({ kind: 'investigate', spec: 'acme/api#42' })
  })

  test('triage with permission mode', () => {
    const result = parseArgs(['bun', 'orchentra', 'triage', 'acme/api#1', '--permission-mode', 'read-only'])
    expect(result).toMatchObject({ kind: 'triage', permissionMode: 'read-only' })
  })

  test('fix with title and base', () => {
    const result = parseArgs(['bun', 'orchentra', 'fix', 'acme/api#9', '--title', 'fix: ci', '--base', 'develop'])
    expect(result).toMatchObject({ kind: 'fix', spec: 'acme/api#9', title: 'fix: ci', base: 'develop' })
  })

  test('fix --auto-merge defaults to false when not passed', () => {
    const result = parseArgs(['bun', 'orchentra', 'fix', 'acme/api#9'])
    expect(result).toMatchObject({ kind: 'fix', autoMerge: false })
  })

  test('fix --auto-merge sets the flag to true', () => {
    const result = parseArgs(['bun', 'orchentra', 'fix', 'acme/api#9', '--auto-merge'])
    expect(result).toMatchObject({ kind: 'fix', autoMerge: true })
  })

  test('investigate rejects --auto-merge', () => {
    expect(() => parseArgs(['bun', 'orchentra', 'investigate', 'acme/api#9', '--auto-merge'])).toThrow(/--auto-merge/)
  })

  test('triage rejects --auto-merge', () => {
    expect(() => parseArgs(['bun', 'orchentra', 'triage', 'acme/api#9', '--auto-merge'])).toThrow(/--auto-merge/)
  })

  test('fix missing spec throws', () => {
    expect(() => parseArgs(['bun', 'orchentra', 'fix'])).toThrow(/missing/)
  })

  test('subcommand flags require values', () => {
    expect(() => parseArgs(['bun', 'orchentra', 'fix', 'acme/api#9', '--model'])).toThrow(/requires a value/)
    expect(() => parseArgs(['bun', 'orchentra', 'investigate', 'acme/api#9', '--permission-mode'])).toThrow(
      /requires a value/,
    )
    expect(() => parseArgs(['bun', 'orchentra', 'fix', 'acme/api#9', '--title'])).toThrow(/requires a value/)
    expect(() => parseArgs(['bun', 'orchentra', 'fix', 'acme/api#9', '--base'])).toThrow(/requires a value/)
  })

  test('session replay with id', () => {
    const result = parseArgs(['bun', 'orchentra', 'session', 'replay', 'abc123'])
    expect(result).toMatchObject({ kind: 'session-replay', idOrLatest: 'abc123' })
  })

  test('session replay latest', () => {
    const result = parseArgs(['bun', 'orchentra', 'session', 'replay', 'latest'])
    expect(result).toMatchObject({ kind: 'session-replay', idOrLatest: 'latest' })
  })

  test('session replay missing id throws', () => {
    expect(() => parseArgs(['bun', 'orchentra', 'session', 'replay'])).toThrow(/missing/)
  })

  test('session unknown subcommand throws', () => {
    expect(() => parseArgs(['bun', 'orchentra', 'session', 'foo'])).toThrow(/unknown subcommand/)
  })

  test('doctor returns doctor action', () => {
    expect(parseArgs(['bun', 'orchentra', 'doctor'])).toMatchObject({ kind: 'doctor' })
  })

  test('watch with repo', () => {
    expect(parseArgs(['bun', 'orchentra', 'watch', 'acme/api'])).toMatchObject({ kind: 'watch', repo: 'acme/api' })
  })

  test('watch with interval', () => {
    expect(parseArgs(['bun', 'orchentra', 'watch', 'acme/api', '--interval', '30'])).toMatchObject({
      kind: 'watch',
      repo: 'acme/api',
      intervalMs: 30000,
    })
  })

  test('watch missing repo throws', () => {
    expect(() => parseArgs(['bun', 'orchentra', 'watch'])).toThrow(/missing/)
  })

  test('mcp serve returns mcp serve action', () => {
    expect(parseArgs(['bun', 'orchentra', 'mcp', 'serve'])).toMatchObject({
      kind: 'mcp',
      sub: 'serve',
      printToolsJson: false,
    })
  })

  test('mcp serve --print-tools-json sets the flag', () => {
    expect(parseArgs(['bun', 'orchentra', 'mcp', 'serve', '--print-tools-json'])).toMatchObject({
      kind: 'mcp',
      sub: 'serve',
      printToolsJson: true,
    })
  })

  test('mcp serve rejects unknown flags', () => {
    expect(() => parseArgs(['bun', 'orchentra', 'mcp', 'serve', '--bogus'])).toThrow(/unknown flag/)
  })

  test('graph with executionId', () => {
    expect(parseArgs(['bun', 'orchentra', 'graph', 'exec_abc123'])).toMatchObject({
      kind: 'graph',
      executionId: 'exec_abc123',
      outputFormat: 'tree',
    })
  })

  test('graph missing executionId throws', () => {
    expect(() => parseArgs(['bun', 'orchentra', 'graph'])).toThrow(/missing/)
  })

  test('graph --output-format json sets outputFormat', () => {
    expect(parseArgs(['bun', 'orchentra', 'graph', 'exec_abc', '--output-format', 'json'])).toMatchObject({
      kind: 'graph',
      executionId: 'exec_abc',
      outputFormat: 'json',
    })
  })

  test('graph --json is an alias for --output-format json', () => {
    expect(parseArgs(['bun', 'orchentra', 'graph', 'exec_abc', '--json'])).toMatchObject({
      kind: 'graph',
      executionId: 'exec_abc',
      outputFormat: 'json',
    })
  })

  test('graph --output-format tree is the default and explicit', () => {
    expect(parseArgs(['bun', 'orchentra', 'graph', 'exec_abc', '--output-format', 'tree'])).toMatchObject({
      kind: 'graph',
      outputFormat: 'tree',
    })
  })

  test('graph --output-format yaml is rejected', () => {
    expect(() => parseArgs(['bun', 'orchentra', 'graph', 'exec_abc', '--output-format', 'yaml'])).toThrow(
      /output-format/,
    )
  })

  test('help text lists the graph verb', () => {
    expect(renderHelp()).toMatch(/orchentra graph <executionId>/)
  })

  test('why with nodeId', () => {
    expect(parseArgs(['bun', 'orchentra', 'why', 'node_abc'])).toMatchObject({
      kind: 'why',
      nodeId: 'node_abc',
      outputFormat: 'tree',
    })
  })

  test('why missing nodeId throws', () => {
    expect(() => parseArgs(['bun', 'orchentra', 'why'])).toThrow(/missing/)
  })

  test('why --output-format json sets outputFormat', () => {
    expect(parseArgs(['bun', 'orchentra', 'why', 'node_abc', '--output-format', 'json'])).toMatchObject({
      kind: 'why',
      nodeId: 'node_abc',
      outputFormat: 'json',
    })
  })

  test('why --json is an alias for --output-format json', () => {
    expect(parseArgs(['bun', 'orchentra', 'why', 'node_abc', '--json'])).toMatchObject({
      kind: 'why',
      nodeId: 'node_abc',
      outputFormat: 'json',
    })
  })

  test('why --output-format yaml is rejected', () => {
    expect(() => parseArgs(['bun', 'orchentra', 'why', 'node_abc', '--output-format', 'yaml'])).toThrow(/output-format/)
  })
})
