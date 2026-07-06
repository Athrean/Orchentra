import { describe, expect, test } from 'bun:test'
import { runDoctor, type DoctorOptions, type DoctorCheck } from '../src/commands/doctor'

describe('runDoctor', () => {
  const allPassing: Partial<DoctorOptions> = {
    resolveToken: () => ({ token: 'ghp_test', source: 'env' as const }),
    validateApiKey: () => ({ valid: true }),
    diskAvailable: () => 100_000_000,
    fetchProvider: async () => new Response('ok', { status: 200 }),
    gitRepo: () => ({ isRepo: true, clean: true, hasRemote: true }),
    env: () => ({ ANTHROPIC_API_KEY: 'sk-test' }),
  }

  test('returns 0 when all checks pass', async () => {
    const checks = await collectChecks(allPassing)
    expect(checks.every((c) => c.status === 'pass')).toBe(true)
  })

  test('reports git repo status: clean repo with a remote passes', async () => {
    const checks = await collectChecks({
      ...allPassing,
      gitRepo: () => ({ isRepo: true, clean: true, hasRemote: true }),
    })
    const git = checks.find((c) => c.name === 'git-repo')
    expect(git?.status).toBe('pass')
    expect(git?.message).toContain('clean')
    expect(git?.message).toContain('remote')
  })

  test('reports git repo status: not a repository warns', async () => {
    const checks = await collectChecks({
      ...allPassing,
      gitRepo: () => ({ isRepo: false, clean: false, hasRemote: false }),
    })
    const git = checks.find((c) => c.name === 'git-repo')
    expect(git?.status).toBe('warn')
    expect(git?.message).toContain('not a git repository')
  })

  test('reports env vars: a set auth var passes and is named', async () => {
    const checks = await collectChecks({ ...allPassing, env: () => ({ ANTHROPIC_API_KEY: 'sk-test' }) })
    const env = checks.find((c) => c.name === 'env-vars')
    expect(env?.status).toBe('pass')
    expect(env?.message).toContain('ANTHROPIC_API_KEY')
  })

  test('reports env vars: no auth var set warns and lists what it looked for', async () => {
    const checks = await collectChecks({ ...allPassing, env: () => ({}) })
    const env = checks.find((c) => c.name === 'env-vars')
    expect(env?.status).toBe('warn')
    expect(env?.message).toContain('ANTHROPIC_API_KEY')
  })

  test('reports fail when GitHub token missing', async () => {
    const checks = await collectChecks({
      resolveToken: () => null,
      validateApiKey: () => ({ valid: true }),
      diskAvailable: () => 100_000_000,
      fetchProvider: async () => new Response('ok', { status: 200 }),
    })
    const gh = checks.find((c) => c.name === 'github-token')
    expect(gh).toBeDefined()
    expect(gh!.status).toBe('fail')
  })

  test('reports fail when provider unreachable', async () => {
    const checks = await collectChecks({
      resolveToken: () => ({ token: 'ghp_test', source: 'env' as const }),
      validateApiKey: () => ({ valid: true }),
      diskAvailable: () => 100_000_000,
      fetchProvider: async () => new Response('error', { status: 503 }),
    })
    const provider = checks.find((c) => c.name === 'provider')
    expect(provider).toBeDefined()
    expect(provider!.status).toBe('fail')
  })

  test('reports fail when API key missing', async () => {
    const checks = await collectChecks({
      resolveToken: () => ({ token: 'ghp_test', source: 'env' as const }),
      validateApiKey: () => ({ valid: false, error: 'ANTHROPIC_API_KEY not set' }),
      diskAvailable: () => 100_000_000,
      fetchProvider: async () => new Response('ok', { status: 200 }),
    })
    const api = checks.find((c) => c.name === 'api-key')
    expect(api).toBeDefined()
    expect(api!.status).toBe('fail')
  })

  test('reports warn when disk low', async () => {
    const checks = await collectChecks({
      resolveToken: () => ({ token: 'ghp_test', source: 'env' as const }),
      validateApiKey: () => ({ valid: true }),
      diskAvailable: () => 500_000,
      fetchProvider: async () => new Response('ok', { status: 200 }),
    })
    const disk = checks.find((c) => c.name === 'disk')
    expect(disk).toBeDefined()
    expect(disk!.status).toBe('warn')
  })

  test('exit code is 1 when any check fails', async () => {
    const code = await runDoctor({
      resolveToken: () => null,
      validateApiKey: () => ({ valid: true }),
      diskAvailable: () => 100_000_000,
      fetchProvider: async () => new Response('ok', { status: 200 }),
    })
    expect(code).toBe(1)
  })
})

async function collectChecks(overrides: Partial<DoctorOptions>): Promise<DoctorCheck[]> {
  const results: DoctorCheck[] = []
  await runDoctor({
    ...overrides,
    reporter: (check) => {
      results.push(check)
    },
  } as DoctorOptions)
  return results
}
