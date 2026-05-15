import { describe, expect, test } from 'bun:test'
import {
  defaultIncidentPrereq,
  buildIncidentPrereq,
  type IncidentPrereqEnv,
} from '../src/commands/builtin/incident-prereq-check'
import { MissingOrchentraConfigError } from '@orchentra/cli-api'
import type { CommandContext } from '../src/commands/registry'
import type { SessionControl } from '@orchentra/cli-core'

function makeSession(): SessionControl {
  return { getSessionId: () => 's' } as unknown as SessionControl
}

function makeCtx(): CommandContext {
  return { cwd: '/work', session: makeSession() }
}

describe('defaultIncidentPrereq.check', () => {
  test('returns ok when config resolves', async () => {
    const env: IncidentPrereqEnv = {
      resolveConfig: () => ({ serverUrl: 'http://localhost:3001', orgId: 'demo', apiKey: 'k' }),
      readRepoOrigin: () => 'git@github.com:demo/repo.git',
    }
    const probe = buildIncidentPrereq(env)
    const result = await probe.check(makeCtx())
    expect(result.ok).toBe(true)
  })

  test('returns rows when Orchentra config is missing', async () => {
    const env: IncidentPrereqEnv = {
      resolveConfig: () => {
        throw new MissingOrchentraConfigError(['orgId', 'apiKey'])
      },
      readRepoOrigin: () => 'git@github.com:demo/repo.git',
    }
    const probe = buildIncidentPrereq(env)
    const result = await probe.check(makeCtx())
    if (result.ok) throw new Error('expected ok=false')
    const keys = result.rows.map((r) => r.key)
    expect(keys).toContain('Orchentra config')
    const cfgRow = result.rows.find((r) => r.key === 'Orchentra config')!
    expect(cfgRow.value).toMatch(/missing/i)
    // Hint to fix it must mention orgId/apiKey somewhere in the card.
    const joined = result.rows.map((r) => `${r.key}: ${r.value}`).join('\n')
    expect(joined).toMatch(/orgId/i)
    expect(joined).toMatch(/apiKey/i)
  })

  test('surfaces a GitHub App install URL row when origin is a github repo', async () => {
    const env: IncidentPrereqEnv = {
      resolveConfig: () => {
        throw new MissingOrchentraConfigError(['orgId'])
      },
      readRepoOrigin: () => 'git@github.com:demo/repo.git',
    }
    const probe = buildIncidentPrereq(env)
    const result = await probe.check(makeCtx())
    if (result.ok) throw new Error('expected ok=false')
    const installRow = result.rows.find((r) => r.key === 'GitHub App')
    expect(installRow).toBeDefined()
    expect(installRow!.value).toContain('github.com')
    expect(installRow!.value).toContain('installations/new')
  })

  test('GitHub App row reports unknown when origin is non-github', async () => {
    const env: IncidentPrereqEnv = {
      resolveConfig: () => {
        throw new MissingOrchentraConfigError(['orgId'])
      },
      readRepoOrigin: () => 'git@gitlab.com:demo/repo.git',
    }
    const probe = buildIncidentPrereq(env)
    const result = await probe.check(makeCtx())
    if (result.ok) throw new Error('expected ok=false')
    const installRow = result.rows.find((r) => r.key === 'GitHub App')
    expect(installRow).toBeDefined()
    expect(installRow!.value.toLowerCase()).toMatch(/not a github repo|n\/a/i)
  })

  test('defaultIncidentPrereq is exported for wiring', () => {
    expect(typeof defaultIncidentPrereq.check).toBe('function')
  })
})
