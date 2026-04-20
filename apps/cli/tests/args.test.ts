import { test, expect, describe } from 'bun:test'
import { parseArgs } from '../src/args'

describe('parseArgs', () => {
  test('bare invocation returns REPL action', () => {
    const action = parseArgs(['node', 'orchentra'])
    expect(action.kind).toBe('repl')
  })

  test('--version returns version action', () => {
    expect(parseArgs(['node', 'orchestra', '--version']).kind).toBe('version')
    expect(parseArgs(['node', 'orchestra', '-V']).kind).toBe('version')
    expect(parseArgs(['node', 'orchestra', 'version']).kind).toBe('version')
  })

  test('--help returns help action', () => {
    expect(parseArgs(['node', 'orchestra', '--help']).kind).toBe('help')
    expect(parseArgs(['node', 'orchestra', '-h']).kind).toBe('help')
  })

  test('init returns init action', () => {
    expect(parseArgs(['node', 'orchestra', 'init']).kind).toBe('init')
  })

  test('-p with prompt returns prompt action', () => {
    const action = parseArgs(['node', 'orchestra', '-p', 'hello world'])
    expect(action.kind).toBe('prompt')
    if (action.kind === 'prompt') {
      expect(action.prompt).toBe('hello world')
    }
  })

  test('positional prompt returns prompt action', () => {
    const action = parseArgs(['node', 'orchestra', 'explain this code'])
    expect(action.kind).toBe('prompt')
    if (action.kind === 'prompt') {
      expect(action.prompt).toBe('explain this code')
    }
  })

  test('--model sets model', () => {
    const action = parseArgs(['node', 'orchestra', '--model', 'opus', '-p', 'hi'])
    expect(action.kind).toBe('prompt')
    if (action.kind === 'prompt') {
      expect(action.model).toBe('opus')
    }
  })

  test('--permission-mode sets mode', () => {
    const action = parseArgs(['node', 'orchestra', '--permission-mode', 'read-only', '-p', 'hi'])
    expect(action.kind).toBe('prompt')
    if (action.kind === 'prompt') {
      expect(action.permissionMode).toBe('read-only')
    }
  })

  test('--dangerously-skip-permissions sets allow mode', () => {
    const action = parseArgs(['node', 'orchestra', '--dangerously-skip-permissions', '-p', 'hi'])
    expect(action.kind).toBe('prompt')
    if (action.kind === 'prompt') {
      expect(action.permissionMode).toBe('allow')
    }
  })

  test('--output-format json sets format', () => {
    const action = parseArgs(['node', 'orchestra', '--output-format', 'json', '-p', 'hi'])
    expect(action.kind).toBe('prompt')
    if (action.kind === 'prompt') {
      expect(action.outputFormat).toBe('json')
    }
  })

  test('--resume returns resume action', () => {
    const action = parseArgs(['node', 'orchestra', '--resume', '/path/to/session.jsonl'])
    expect(action.kind).toBe('resume')
    if (action.kind === 'resume') {
      expect(action.sessionPath).toBe('/path/to/session.jsonl')
    }
  })

  test('--compact flag is parsed', () => {
    const action = parseArgs(['node', 'orchestra', '--compact', '-p', 'hi'])
    expect(action.kind).toBe('prompt')
    if (action.kind === 'prompt') {
      expect(action.compact).toBe(true)
    }
  })

  test('unknown flag throws error', () => {
    expect(() => parseArgs(['node', 'orchestra', '--unknown-flag'])).toThrow('unknown flag')
  })

  test('invalid permission mode throws error', () => {
    expect(() => parseArgs(['node', 'orchestra', '--permission-mode', 'invalid', '-p', 'hi'])).toThrow(
      'invalid permission mode',
    )
  })
})
