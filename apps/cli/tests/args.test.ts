import { test, expect, describe } from 'bun:test'
import { parseArgs } from '../src/args'

describe('parseArgs', () => {
  test('bare invocation returns REPL action', () => {
    const action = parseArgs(['node', 'orchentra'])
    expect(action.kind).toBe('repl')
  })

  test('--version returns version action', () => {
    expect(parseArgs(['node', 'orchentra', '--version']).kind).toBe('version')
    expect(parseArgs(['node', 'orchentra', '-V']).kind).toBe('version')
    expect(parseArgs(['node', 'orchentra', 'version']).kind).toBe('version')
  })

  test('--help returns help action', () => {
    expect(parseArgs(['node', 'orchentra', '--help']).kind).toBe('help')
    expect(parseArgs(['node', 'orchentra', '-h']).kind).toBe('help')
  })

  test('init returns init action', () => {
    expect(parseArgs(['node', 'orchentra', 'init']).kind).toBe('init')
  })

  test('-p with prompt returns prompt action', () => {
    const action = parseArgs(['node', 'orchentra', '-p', 'hello world'])
    expect(action.kind).toBe('prompt')
    if (action.kind === 'prompt') {
      expect(action.prompt).toBe('hello world')
    }
  })

  test('positional prompt returns prompt action', () => {
    const action = parseArgs(['node', 'orchentra', 'explain this code'])
    expect(action.kind).toBe('prompt')
    if (action.kind === 'prompt') {
      expect(action.prompt).toBe('explain this code')
    }
  })

  test('--model sets model', () => {
    const action = parseArgs(['node', 'orchentra', '--model', 'opus', '-p', 'hi'])
    expect(action.kind).toBe('prompt')
    if (action.kind === 'prompt') {
      expect(action.model).toBe('opus')
    }
  })

  test('--permission-mode sets mode', () => {
    const action = parseArgs(['node', 'orchentra', '--permission-mode', 'read-only', '-p', 'hi'])
    expect(action.kind).toBe('prompt')
    if (action.kind === 'prompt') {
      expect(action.permissionMode).toBe('read-only')
    }
  })

  test('--dangerously-skip-permissions sets allow mode', () => {
    const action = parseArgs(['node', 'orchentra', '--dangerously-skip-permissions', '-p', 'hi'])
    expect(action.kind).toBe('prompt')
    if (action.kind === 'prompt') {
      expect(action.permissionMode).toBe('allow')
    }
  })

  test('--resume returns resume action', () => {
    const action = parseArgs(['node', 'orchentra', '--resume', '/path/to/session.jsonl'])
    expect(action.kind).toBe('resume')
    if (action.kind === 'resume') {
      expect(action.sessionPath).toBe('/path/to/session.jsonl')
    }
  })

  test('unknown flag throws error', () => {
    expect(() => parseArgs(['node', 'orchentra', '--unknown-flag'])).toThrow('unknown flag')
  })

  test('invalid permission mode throws error', () => {
    expect(() => parseArgs(['node', 'orchentra', '--permission-mode', 'invalid', '-p', 'hi'])).toThrow(
      'invalid permission mode',
    )
  })
})
