import { describe, expect, test } from 'bun:test'
import { markRepoInstallation } from '../src/lib/repo-install-merge'

interface BaseRepo {
  fullName: string
  owner: string
  name: string
  private: boolean
  description: string | null
}

function baseRepo(over: Partial<{ fullName: string; owner: string }> = {}): BaseRepo {
  return {
    fullName: over.fullName ?? 'acme/api',
    owner: over.owner ?? 'acme',
    name: 'api',
    private: false,
    description: null,
  }
}

describe('markRepoInstallation', () => {
  test('marks installed=true when the owner login is in the installed set', () => {
    const out = markRepoInstallation([baseRepo({ owner: 'acme' })], new Set(['acme']))
    expect(out[0]!.installed).toBe(true)
  })

  test('marks installed=false when no installation matches the owner', () => {
    const out = markRepoInstallation([baseRepo({ owner: 'evilcorp' })], new Set(['acme']))
    expect(out[0]!.installed).toBe(false)
  })

  test('matches owners case-insensitively', () => {
    const out = markRepoInstallation([baseRepo({ owner: 'AcMe' })], new Set(['acme']))
    expect(out[0]!.installed).toBe(true)
  })

  test('preserves the original row fields verbatim', () => {
    const row = baseRepo({ fullName: 'acme/web', owner: 'acme' })
    const [annotated] = markRepoInstallation([row], new Set(['acme']))
    expect(annotated!.fullName).toBe('acme/web')
    expect(annotated!.owner).toBe('acme')
    expect(annotated!.name).toBe('api')
    expect(annotated!.private).toBe(false)
  })
})
