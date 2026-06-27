import { describe, expect, test } from 'bun:test'
import { parseArgs, renderHelp } from '../src/args'

describe('parseArgs — subcommands', () => {
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

  test('mcp list is the default', () => {
    expect(parseArgs(['bun', 'orchentra', 'mcp'])).toMatchObject({ kind: 'mcp', sub: 'list' })
    expect(parseArgs(['bun', 'orchentra', 'mcp', 'list'])).toMatchObject({ kind: 'mcp', sub: 'list' })
  })

  test('mcp test requires a name', () => {
    expect(parseArgs(['bun', 'orchentra', 'mcp', 'test', 'srv'])).toMatchObject({
      kind: 'mcp',
      sub: 'test',
      name: 'srv',
    })
    expect(() => parseArgs(['bun', 'orchentra', 'mcp', 'test'])).toThrow(/missing/)
  })

  test('mcp rejects removed serve subcommand', () => {
    expect(() => parseArgs(['bun', 'orchentra', 'mcp', 'serve'])).toThrow(/unknown subcommand/)
  })

  test('update defaults to latest tag', () => {
    expect(parseArgs(['bun', 'orchentra', 'update'])).toEqual({ kind: 'update', dryRun: false, tag: 'latest' })
  })

  test('update accepts dry-run and dist-tags', () => {
    expect(parseArgs(['bun', 'orchentra', 'update', '--dry-run', '--tag', 'alpha'])).toEqual({
      kind: 'update',
      dryRun: true,
      tag: 'alpha',
    })
    expect(parseArgs(['bun', 'orchentra', 'update', '--tag=beta'])).toEqual({
      kind: 'update',
      dryRun: false,
      tag: 'beta',
    })
  })

  test('update rejects invalid tags and flags', () => {
    expect(() => parseArgs(['bun', 'orchentra', 'update', '--tag', 'nightly'])).toThrow(/invalid update tag/)
    expect(() => parseArgs(['bun', 'orchentra', 'update', '--force'])).toThrow(/unknown argument/)
  })

  test('help text lists core verbs, not DevOps', () => {
    const help = renderHelp()
    expect(help).toMatch(/orchentra mcp list/)
    expect(help).toMatch(/orchentra update/)
    expect(help).not.toMatch(/graph|triage|investigate|watch/)
  })
})
