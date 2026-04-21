import { test, expect, describe } from 'bun:test'
import { parseSlashCommand, slashCommandSpecs, renderCommandHelp } from '../src/commands'

describe('parseSlashCommand', () => {
  test('returns null for non-slash input', () => {
    expect(parseSlashCommand('hello')).toBeNull()
  })

  test('returns null for empty string', () => {
    expect(parseSlashCommand('')).toBeNull()
  })

  test('parses /help', () => {
    const result = parseSlashCommand('/help')
    expect(result).toEqual({ kind: 'help' })
  })

  test('parses /exit via alias /quit', () => {
    const result = parseSlashCommand('/quit')
    expect(result).toEqual({ kind: 'exit' })
  })

  test('parses /model with argument', () => {
    const result = parseSlashCommand('/model opus')
    expect(result).toEqual({ kind: 'model', model: 'opus' })
  })

  test('parses /model without argument', () => {
    const result = parseSlashCommand('/model')
    expect(result).toEqual({ kind: 'model', model: undefined })
  })

  test('returns Error for unknown command', () => {
    const result = parseSlashCommand('/foo')
    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toBe('unknown command: /foo')
  })
})

describe('slashCommandSpecs', () => {
  test('returns 9 specs', () => {
    const specs = slashCommandSpecs()
    expect(specs.length).toBe(9)
  })
})

describe('renderCommandHelp', () => {
  test('produces non-empty string', () => {
    const help = renderCommandHelp()
    expect(typeof help).toBe('string')
    expect(help.length).toBeGreaterThan(0)
  })
})
