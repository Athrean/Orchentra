import { describe, expect, test } from 'bun:test'
import { parseArgs } from '../src/args'

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
})
