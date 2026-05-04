import { describe, expect, test } from 'bun:test'
import { createTrustStore } from '../src/trust/store'
import { resolveTrust } from '../src/trust/resolver'

describe('resolveTrust', () => {
  test('cwd not in store → prompt', () => {
    const s = createTrustStore()
    expect(resolveTrust('/repo/a', s)).toBe('prompt')
  })

  test('cwd exactly matches trusted entry → trusted', () => {
    const s = createTrustStore()
    s.trust('/repo/a')
    expect(resolveTrust('/repo/a', s)).toBe('trusted')
  })

  test('cwd is descendant of trusted root → trusted', () => {
    const s = createTrustStore()
    s.trust('/repo/a')
    expect(resolveTrust('/repo/a/sub/dir', s)).toBe('trusted')
  })

  test('cwd matches denied → denied', () => {
    const s = createTrustStore()
    s.deny('/tmp/sus')
    expect(resolveTrust('/tmp/sus', s)).toBe('denied')
  })

  test('cwd is descendant of denied root → denied', () => {
    const s = createTrustStore()
    s.deny('/tmp/sus')
    expect(resolveTrust('/tmp/sus/inside', s)).toBe('denied')
  })

  test('denied descendant under trusted root → denied (deny wins)', () => {
    const s = createTrustStore()
    s.trust('/repo')
    s.deny('/repo/inner')
    expect(resolveTrust('/repo/inner/sub', s)).toBe('denied')
    expect(resolveTrust('/repo/other', s)).toBe('trusted')
  })

  test('sibling prefix does not match trusted root', () => {
    const s = createTrustStore()
    s.trust('/tmp/worktrees')
    expect(resolveTrust('/tmp/worktrees-other/repo', s)).toBe('prompt')
  })

  test('sibling prefix does not match denied root', () => {
    const s = createTrustStore()
    s.deny('/tmp/foo')
    expect(resolveTrust('/tmp/foo-bar', s)).toBe('prompt')
  })

  test('most-specific deny still wins even if cwd is also explicitly trusted', () => {
    // store enforces deny-overrides-trust on write, but resolver must be defensive
    const s = createTrustStore()
    s.trust('/repo')
    s.deny('/repo')
    expect(resolveTrust('/repo', s)).toBe('denied')
  })

  test('trailing slash on stored root tolerated', () => {
    const s = createTrustStore()
    s.trust('/repo/a/')
    expect(resolveTrust('/repo/a', s)).toBe('trusted')
    expect(resolveTrust('/repo/a/sub', s)).toBe('trusted')
  })
})
