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

  test('help text lists core verbs, not DevOps', () => {
    const help = renderHelp()
    expect(help).toMatch(/orchentra mcp list/)
    expect(help).not.toMatch(/graph|triage|investigate|watch/)
  })
})
