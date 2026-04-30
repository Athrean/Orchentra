import { describe, expect, test } from 'bun:test'
import { MacKeychain, type KeychainExec } from '../src/keychain'

function fakeExec(responses: ReadonlyArray<{ code: number; stdout?: string; stderr?: string }>): {
  exec: KeychainExec
  calls: ReadonlyArray<readonly string[]>
} {
  const calls: Array<readonly string[]> = []
  let idx = 0
  const exec: KeychainExec = async (args) => {
    calls.push(args)
    const r = responses[idx++] ?? { code: 1, stderr: 'no canned response' }
    return { code: r.code, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
  }
  return { exec, calls }
}

describe('MacKeychain.available', () => {
  test('reflects host platform', () => {
    expect(MacKeychain.available()).toBe(process.platform === 'darwin')
  })
})

describe('findGenericPassword', () => {
  test('returns null when security exits non-zero', async () => {
    const { exec } = fakeExec([{ code: 44, stderr: 'The specified item could not be found in the keychain.' }])
    const kc = new MacKeychain(exec)
    expect(await kc.findGenericPassword('missing-service')).toBeNull()
  })

  test('returns entry on success and strips trailing newline', async () => {
    const { exec, calls } = fakeExec([{ code: 0, stdout: 'sk-ant-oat01-secret\n' }])
    const kc = new MacKeychain(exec)
    const entry = await kc.findGenericPassword('Claude Code-credentials')
    expect(entry).toEqual({
      service: 'Claude Code-credentials',
      account: null,
      password: 'sk-ant-oat01-secret',
    })
    expect(calls[0]).toEqual(['find-generic-password', '-s', 'Claude Code-credentials', '-w'])
  })

  test('passes -a flag only when account provided', async () => {
    const { exec, calls } = fakeExec([{ code: 0, stdout: 'pw\n' }])
    const kc = new MacKeychain(exec)
    await kc.findGenericPassword('svc', 'alice@example.com')
    expect(calls[0]).toEqual(['find-generic-password', '-s', 'svc', '-a', 'alice@example.com', '-w'])
  })

  test('returns null when security CLI not available (code 127)', async () => {
    const { exec } = fakeExec([{ code: 127, stderr: 'security CLI not available' }])
    const kc = new MacKeychain(exec)
    expect(await kc.findGenericPassword('svc')).toBeNull()
  })
})

describe('listGenericPasswordServices', () => {
  test('parses svce blob entries and filters by prefix', async () => {
    const dump = [
      'keychain: "/Users/u/Library/Keychains/login.keychain-db"',
      '    "svce"<blob>="Claude Code-credentials"',
      '    "svce"<blob>="Claude Code-credentials-work"',
      '    "svce"<blob>="Spotify"',
      '    "svce"<blob>=<NULL>',
    ].join('\n')
    const { exec, calls } = fakeExec([{ code: 0, stdout: dump }])
    const kc = new MacKeychain(exec)
    const services = await kc.listGenericPasswordServices('Claude Code-credentials')
    expect(services.sort()).toEqual(['Claude Code-credentials', 'Claude Code-credentials-work'])
    expect(calls[0]).toEqual(['dump-keychain'])
  })

  test('returns empty when dump fails', async () => {
    const { exec } = fakeExec([{ code: 1, stderr: 'denied' }])
    const kc = new MacKeychain(exec)
    expect(await kc.listGenericPasswordServices('Claude')).toEqual([])
  })

  test('deduplicates repeated service names', async () => {
    const dump = ['    "svce"<blob>="Claude Code-credentials"', '    "svce"<blob>="Claude Code-credentials"'].join('\n')
    const { exec } = fakeExec([{ code: 0, stdout: dump }])
    const kc = new MacKeychain(exec)
    expect(await kc.listGenericPasswordServices('Claude')).toEqual(['Claude Code-credentials'])
  })

  test('handles escaped quote characters in service names', async () => {
    const dump = '    "svce"<blob>="Foo\\"Bar"'
    const { exec } = fakeExec([{ code: 0, stdout: dump }])
    const kc = new MacKeychain(exec)
    expect(await kc.listGenericPasswordServices('Foo')).toEqual(['Foo"Bar'])
  })
})
