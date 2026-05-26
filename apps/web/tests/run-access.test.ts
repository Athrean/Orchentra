import { describe, expect, it } from 'bun:test'
import { subscriptionMatches } from '../lib/github/run-access'

const subs = [
  { installationId: 111, repoFullName: 'acme/app' },
  { installationId: 222, repoFullName: 'acme/api' },
]

describe('subscriptionMatches', () => {
  it('returns true when installation and repo both match a subscription', () => {
    expect(subscriptionMatches(subs, 111, 'acme/app')).toBe(true)
  })

  it('returns false when the repo matches but the installation does not', () => {
    expect(subscriptionMatches(subs, 999, 'acme/app')).toBe(false)
  })

  it('returns false when the installation matches but the repo does not', () => {
    expect(subscriptionMatches(subs, 111, 'acme/other')).toBe(false)
  })

  it('returns false for an empty subscription list', () => {
    expect(subscriptionMatches([], 111, 'acme/app')).toBe(false)
  })
})
