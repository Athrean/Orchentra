import { describe, expect, test } from 'bun:test'
import { MacKeychain, type KeychainExec } from '../src/keychain'
import {
  CLAUDE_CODE_KEYCHAIN_SERVICE,
  loadAllClaudeCodeOauth,
  loadClaudeCodeOauth,
} from '../src/anthropic/claude-code-creds'

function fakeExec(canned: Map<string, { code: number; stdout?: string; stderr?: string }>): KeychainExec {
  return async (args) => {
    const key = args.join(' ')
    const r = canned.get(key) ?? { code: 1, stderr: 'no canned response for ' + key }
    return { code: r.code, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
  }
}

function payload(accessToken: string, refreshToken: string, expiresAt: number): string {
  return JSON.stringify({ claudeAiOauth: { accessToken, refreshToken, expiresAt } })
}

describe('loadClaudeCodeOauth', () => {
  test('returns null when canonical entry missing and no variants found', async () => {
    const exec = fakeExec(
      new Map([
        [`find-generic-password -s ${CLAUDE_CODE_KEYCHAIN_SERVICE} -w`, { code: 44, stderr: 'not found' }],
        ['dump-keychain', { code: 0, stdout: '' }],
      ]),
    )
    const cred = await loadClaudeCodeOauth(new MacKeychain(exec))
    expect(cred).toBeNull()
  })

  test('parses canonical entry into StoredCredential shape', async () => {
    const expires = 1_900_000_000_000
    const exec = fakeExec(
      new Map([
        [
          `find-generic-password -s ${CLAUDE_CODE_KEYCHAIN_SERVICE} -w`,
          { code: 0, stdout: payload('sk-ant-oat01-A', 'sk-ant-ort01-R', expires) + '\n' },
        ],
      ]),
    )
    const cred = await loadClaudeCodeOauth(new MacKeychain(exec))
    expect(cred).toEqual({
      accessToken: 'sk-ant-oat01-A',
      refreshToken: 'sk-ant-ort01-R',
      expiresAt: expires,
      scopes: ['user:inference', 'user:profile'],
      extra: { source: 'claude-code-keychain', service: CLAUDE_CODE_KEYCHAIN_SERVICE },
    })
  })

  test('returns null when payload is not valid JSON', async () => {
    const exec = fakeExec(
      new Map([[`find-generic-password -s ${CLAUDE_CODE_KEYCHAIN_SERVICE} -w`, { code: 0, stdout: 'not-json{' }]]),
    )
    expect(await loadClaudeCodeOauth(new MacKeychain(exec))).toBeNull()
  })

  test('returns null when JSON missing claudeAiOauth.accessToken', async () => {
    const exec = fakeExec(
      new Map([
        [
          `find-generic-password -s ${CLAUDE_CODE_KEYCHAIN_SERVICE} -w`,
          { code: 0, stdout: JSON.stringify({ claudeAiOauth: { refreshToken: 'r' } }) },
        ],
      ]),
    )
    expect(await loadClaudeCodeOauth(new MacKeychain(exec))).toBeNull()
  })

  test('falls back to first variant entry when canonical missing', async () => {
    const expires = 1_900_000_000_000
    const variant = `${CLAUDE_CODE_KEYCHAIN_SERVICE}-work`
    const exec = fakeExec(
      new Map([
        [`find-generic-password -s ${CLAUDE_CODE_KEYCHAIN_SERVICE} -w`, { code: 44, stderr: 'not found' }],
        [
          'dump-keychain',
          {
            code: 0,
            stdout: `    "svce"<blob>="${variant}"`,
          },
        ],
        [`find-generic-password -s ${variant} -w`, { code: 0, stdout: payload('sk-ant-oat01-V', 'r', expires) }],
      ]),
    )
    const cred = await loadClaudeCodeOauth(new MacKeychain(exec))
    expect(cred?.accessToken).toBe('sk-ant-oat01-V')
    expect(cred?.extra?.['service']).toBe(variant)
  })
})

describe('loadAllClaudeCodeOauth', () => {
  test('returns canonical + all matching variants', async () => {
    const variant = `${CLAUDE_CODE_KEYCHAIN_SERVICE}-personal`
    const exec = fakeExec(
      new Map([
        [
          'dump-keychain',
          {
            code: 0,
            stdout: [
              `    "svce"<blob>="${CLAUDE_CODE_KEYCHAIN_SERVICE}"`,
              `    "svce"<blob>="${variant}"`,
              '    "svce"<blob>="Spotify"',
            ].join('\n'),
          },
        ],
        [`find-generic-password -s ${CLAUDE_CODE_KEYCHAIN_SERVICE} -w`, { code: 0, stdout: payload('a1', 'r1', 100) }],
        [`find-generic-password -s ${variant} -w`, { code: 0, stdout: payload('a2', 'r2', 200) }],
      ]),
    )
    const all = await loadAllClaudeCodeOauth(new MacKeychain(exec))
    expect(all.map((e) => e.service).sort()).toEqual([CLAUDE_CODE_KEYCHAIN_SERVICE, variant])
    expect(all.find((e) => e.service === CLAUDE_CODE_KEYCHAIN_SERVICE)?.credential.accessToken).toBe('a1')
    expect(all.find((e) => e.service === variant)?.credential.accessToken).toBe('a2')
  })

  test('skips entries with malformed payload', async () => {
    const exec = fakeExec(
      new Map([
        ['dump-keychain', { code: 0, stdout: `    "svce"<blob>="${CLAUDE_CODE_KEYCHAIN_SERVICE}"` }],
        [`find-generic-password -s ${CLAUDE_CODE_KEYCHAIN_SERVICE} -w`, { code: 0, stdout: 'garbage' }],
      ]),
    )
    expect(await loadAllClaudeCodeOauth(new MacKeychain(exec))).toEqual([])
  })
})
