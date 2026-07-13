import { test, expect, describe } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from '../src/args'
import { setDefaultModel } from '../src/session-config'

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

  test('init rejects removed remote-bootstrap arguments', () => {
    expect(() => parseArgs(['node', 'orchentra', 'init', '--server-url', 'http://localhost'])).toThrow(
      'init: unknown argument',
    )
    expect(() => parseArgs(['node', 'orchentra', 'init', '--owner', 'Athrean'])).toThrow('init: unknown argument')
  })

  test('reauth returns reauth action', () => {
    expect(parseArgs(['node', 'orchentra', 'reauth']).kind).toBe('reauth')
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

  test('saved default model is used when no --model is supplied', () => {
    withConfigHome(() => {
      setDefaultModel('gpt-5')

      const action = parseArgs(['node', 'orchentra', '-p', 'hi'])

      expect(action.kind).toBe('prompt')
      if (action.kind === 'prompt') expect(action.model).toBe('gpt-5')
    })
  })

  test('--model overrides the saved default for that invocation', () => {
    withConfigHome(() => {
      setDefaultModel('gpt-5')

      const action = parseArgs(['node', 'orchentra', '--model', 'opus', '-p', 'hi'])

      expect(action.kind).toBe('prompt')
      if (action.kind === 'prompt') expect(action.model).toBe('opus')
    })
  })

  test('model env override beats the saved default', () => {
    withConfigHome(() => {
      setDefaultModel('gpt-5')
      const prev = process.env.ORCHENTRA_MODEL
      process.env.ORCHENTRA_MODEL = 'gemini-2.5-pro'
      try {
        const action = parseArgs(['node', 'orchentra', '-p', 'hi'])

        expect(action.kind).toBe('prompt')
        if (action.kind === 'prompt') expect(action.model).toBe('gemini-2.5-pro')
      } finally {
        if (prev === undefined) delete process.env.ORCHENTRA_MODEL
        else process.env.ORCHENTRA_MODEL = prev
      }
    })
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

function withConfigHome(fn: () => void): void {
  const prevConfig = process.env.ORCHENTRA_CONFIG_HOME
  const prevModel = process.env.ORCHENTRA_MODEL
  const prevLegacyModel = process.env.ORCHESTRA_MODEL
  const dir = mkdtempSync(join(tmpdir(), 'orchentra-args-'))
  delete process.env.ORCHENTRA_MODEL
  delete process.env.ORCHESTRA_MODEL
  process.env.ORCHENTRA_CONFIG_HOME = dir
  try {
    fn()
  } finally {
    if (prevConfig === undefined) delete process.env.ORCHENTRA_CONFIG_HOME
    else process.env.ORCHENTRA_CONFIG_HOME = prevConfig
    if (prevModel === undefined) delete process.env.ORCHENTRA_MODEL
    else process.env.ORCHENTRA_MODEL = prevModel
    if (prevLegacyModel === undefined) delete process.env.ORCHESTRA_MODEL
    else process.env.ORCHESTRA_MODEL = prevLegacyModel
    rmSync(dir, { recursive: true, force: true })
  }
}
