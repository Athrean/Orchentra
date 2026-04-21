import { describe, expect, test } from 'bun:test'
import { assertOrgAllowed, OrgNotAllowedError } from '../src/commands/org-guard'

describe('assertOrgAllowed', () => {
  test('passes when env var unset', () => {
    expect(() => assertOrgAllowed('anyone', {})).not.toThrow()
  })

  test('passes when owner in allowed list', () => {
    expect(() => assertOrgAllowed('acme', { ORCHENTRA_ALLOWED_ORGS: 'acme,other' })).not.toThrow()
  })

  test('throws when owner not in allowed list', () => {
    expect(() => assertOrgAllowed('intruder', { ORCHENTRA_ALLOWED_ORGS: 'acme,other' })).toThrow(OrgNotAllowedError)
  })

  test('handles whitespace in list', () => {
    expect(() => assertOrgAllowed('acme', { ORCHENTRA_ALLOWED_ORGS: ' acme , other ' })).not.toThrow()
  })
})
