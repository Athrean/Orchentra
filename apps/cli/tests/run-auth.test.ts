/**
 * Slice 5: `orchentra login orchentra --api-key <k>` must save the
 * bootstrap-issued apiKey through the same `saveCredential('orchentra', …)`
 * path the orchestrator uses. Before this slice the verb errored with
 * `unknown provider: orchentra` because the provider lists in
 * `run-auth.ts` only covered LLM/SCM providers.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getCredential } from '@orchentra/cli-api'
import { runLogin } from '../src/commands/run-auth'

describe('runLogin — orchentra provider', () => {
  let configHome: string
  let originalEnv: { home: string | undefined }

  beforeEach(() => {
    configHome = mkdtempSync(join(tmpdir(), 'run-auth-orchentra-home-'))
    originalEnv = { home: process.env.ORCHENTRA_CONFIG_HOME }
    process.env.ORCHENTRA_CONFIG_HOME = configHome
  })

  afterEach(() => {
    rmSync(configHome, { recursive: true, force: true })
    if (originalEnv.home === undefined) delete process.env.ORCHENTRA_CONFIG_HOME
    else process.env.ORCHENTRA_CONFIG_HOME = originalEnv.home
  })

  test('login orchentra --api-key <k> saves the credential and exits 0', async () => {
    const original = process.stderr.write.bind(process.stderr)
    const errChunks: string[] = []
    process.stderr.write = ((c: string | Uint8Array): boolean => {
      errChunks.push(typeof c === 'string' ? c : new TextDecoder().decode(c))
      return true
    }) as typeof process.stderr.write
    try {
      const code = await runLogin('orchentra', 'orch_test_key')
      expect(code).toBe(0)
      // No "unknown provider" regression message on stderr.
      expect(errChunks.join('')).not.toMatch(/unknown provider/i)
    } finally {
      process.stderr.write = original
    }
    const cred = getCredential('orchentra')
    expect(cred?.apiKey).toBe('orch_test_key')
  })
})
