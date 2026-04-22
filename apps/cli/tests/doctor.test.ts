import { describe, expect, test } from 'bun:test'
import { runDoctor, type DoctorOptions, type DoctorCheck } from '../src/commands/doctor'

describe('runDoctor', () => {
  test('returns 0 when all checks pass', async () => {
    const checks = await collectChecks({
      resolveToken: () => ({ token: 'ghp_test', source: 'env' as const }),
      validateApiKey: () => ({ valid: true }),
      diskAvailable: () => 100_000_000,
      fetchProvider: async () => new Response('ok', { status: 200 }),
    })
    expect(checks.every((c) => c.status === 'pass')).toBe(true)
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
