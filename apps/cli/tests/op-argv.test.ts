import { describe, expect, test } from 'bun:test'
import { getPullRequestOperation } from '@orchentra/operations'
import { parseShellArgv, parseSlashArgs } from '../src/op-commands/argv'

describe('parseShellArgv', () => {
  test('parses required flags into typed params for get_pull_request', () => {
    const result = parseShellArgv(getPullRequestOperation, [
      '--owner',
      'Athrean',
      '--repo',
      'Orchentra',
      '--number',
      '7',
    ])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual({ owner: 'Athrean', repo: 'Orchentra', number: 7 })
  })

  test('rejects unknown flag with a friendly error that names the flag', () => {
    const result = parseShellArgv(getPullRequestOperation, [
      '--owner',
      'Athrean',
      '--repo',
      'Orchentra',
      '--number',
      '7',
      '--bogus',
      'x',
    ])

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.toLowerCase()).toContain('bogus')
  })

  test('rejects missing required --number with a friendly error that names the flag', () => {
    const result = parseShellArgv(getPullRequestOperation, ['--owner', 'Athrean', '--repo', 'Orchentra'])

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.toLowerCase()).toContain('number')
  })
})

describe('parseSlashArgs', () => {
  test('parses key=value pairs into typed params for get_pull_request', () => {
    const result = parseSlashArgs(getPullRequestOperation, ['owner=Athrean', 'repo=Orchentra', 'number=7'])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual({ owner: 'Athrean', repo: 'Orchentra', number: 7 })
  })

  test('rejects missing required key with a friendly error that names the key', () => {
    const result = parseSlashArgs(getPullRequestOperation, ['owner=Athrean', 'repo=Orchentra'])

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.toLowerCase()).toContain('number')
  })

  test('rejects unknown key with a friendly error that names the key', () => {
    const result = parseSlashArgs(getPullRequestOperation, ['owner=Athrean', 'repo=Orchentra', 'number=7', 'bogus=x'])

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.toLowerCase()).toContain('bogus')
  })
})
