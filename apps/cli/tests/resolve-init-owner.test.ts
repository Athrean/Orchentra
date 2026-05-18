/**
 * Owner resolution for `orchentra init` follows a deterministic chain:
 * explicit --owner flag → inferred from git origin → readline prompt. An
 * empty prompt response surfaces as null so the caller can exit 1 with a
 * "owner required" message rather than charging into the bootstrap with
 * no identity.
 */

import { describe, expect, test } from 'bun:test'
import { resolveInitOwner } from '../src/commands/resolve-init-owner'

describe('resolveInitOwner', () => {
  test('returns the explicit --owner override unchanged', async () => {
    const got = await resolveInitOwner({
      explicitOwner: 'Athrean',
      infer: () => ({ owner: 'OtherOrg', repo: 'foo' }),
      prompt: async () => 'should-not-be-called',
    })
    expect(got).toBe('Athrean')
  })

  test('falls back to git-inferred owner when no explicit value', async () => {
    const got = await resolveInitOwner({
      explicitOwner: undefined,
      infer: () => ({ owner: 'Athrean', repo: 'Orchentra' }),
      prompt: async () => 'should-not-be-called',
    })
    expect(got).toBe('Athrean')
  })

  test('prompts when inference returns null', async () => {
    const got = await resolveInitOwner({
      explicitOwner: undefined,
      infer: () => null,
      prompt: async () => 'PromptedOwner',
    })
    expect(got).toBe('PromptedOwner')
  })

  test('null on empty prompt input', async () => {
    const got = await resolveInitOwner({
      explicitOwner: undefined,
      infer: () => null,
      prompt: async () => '',
    })
    expect(got).toBeNull()
  })

  test('trims whitespace from prompted input', async () => {
    const got = await resolveInitOwner({
      explicitOwner: undefined,
      infer: () => null,
      prompt: async () => '  Trimmed  ',
    })
    expect(got).toBe('Trimmed')
  })
})
