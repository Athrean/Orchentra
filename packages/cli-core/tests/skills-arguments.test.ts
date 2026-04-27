import { describe, expect, test } from 'bun:test'
import { substituteSkillArguments } from '../src/runtime/skills/arguments'

describe('substituteSkillArguments', () => {
  test('passes through bodies with no placeholders unchanged', () => {
    expect(substituteSkillArguments('hello world', [])).toBe('hello world')
  })

  test('substitutes $ARGUMENTS with the joined args', () => {
    expect(substituteSkillArguments('Run: $ARGUMENTS', ['api', 'prod'])).toBe('Run: api prod')
  })

  test('substitutes positional $0 / $1', () => {
    expect(substituteSkillArguments('Deploy $0 to $1', ['api', 'prod'])).toBe('Deploy api to prod')
  })

  test('mixes $ARGUMENTS and positional in one body', () => {
    const result = substituteSkillArguments('First: $0 (full: $ARGUMENTS)', ['api', 'prod'])
    expect(result).toBe('First: api (full: api prod)')
  })

  test('unmatched positional resolves to empty string', () => {
    expect(substituteSkillArguments('Service: $0 / Region: $5', ['api'])).toBe('Service: api / Region: ')
  })

  test('escapes literal $0 with backslash', () => {
    expect(substituteSkillArguments('Use the literal \\$0 syntax', ['ignored'])).toBe('Use the literal $0 syntax')
  })

  test('repeated references resolve consistently', () => {
    expect(substituteSkillArguments('$0 then $0 again', ['api'])).toBe('api then api again')
  })

  test('$ARGUMENTS empty when no args supplied', () => {
    expect(substituteSkillArguments('value=$ARGUMENTS', [])).toBe('value=')
  })

  test('does not greedily eat trailing word characters', () => {
    expect(substituteSkillArguments('$0extra', ['api'])).toBe('apiextra')
  })

  test('only positionals 0-9 resolve; $10 is ($1)0', () => {
    expect(substituteSkillArguments('$10', ['a', 'b'])).toBe('b0')
  })
})
