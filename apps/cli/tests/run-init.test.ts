import { describe, expect, test } from 'bun:test'
import { runInit } from '../src/commands/run-init'

const report = {
  projectRoot: '/repo',
  artifacts: [{ name: '.orchentra/', status: 'created' as const }],
}

describe('runInit', () => {
  test('initializes locally and keeps existing GitHub login', async () => {
    const output: string[] = []
    let logins = 0
    const code = await runInit({
      cwd: '/repo',
      initialize: () => report,
      hasGitHubToken: () => true,
      loginGitHub: async () => {
        logins++
        return true
      },
      out: (message) => output.push(message),
    })

    expect(code).toBe(0)
    expect(logins).toBe(0)
    expect(output).toContain('✓ GitHub already connected')
  })

  test('starts GitHub device login when token is absent', async () => {
    let logins = 0
    const code = await runInit({
      cwd: '/repo',
      initialize: () => report,
      hasGitHubToken: () => false,
      loginGitHub: async () => {
        logins++
        return true
      },
      out: () => {},
    })

    expect(code).toBe(0)
    expect(logins).toBe(1)
  })

  test('returns failure when GitHub login fails', async () => {
    const code = await runInit({
      cwd: '/repo',
      initialize: () => report,
      hasGitHubToken: () => false,
      loginGitHub: async () => false,
      out: () => {},
    })

    expect(code).toBe(1)
  })
})
