import { describe, expect, test } from 'bun:test'
import { isBrowserOpError } from '@orchentra/cli-core'
import { loadPlaywrightEngine } from '../src/playwright-engine'

async function playwrightPresent(): Promise<boolean> {
  const specifier = 'playwright'
  try {
    await import(specifier)
    return true
  } catch {
    return false
  }
}

const HAS_PLAYWRIGHT = await playwrightPresent()

describe('loadPlaywrightEngine (lazy install path)', () => {
  // Core install pulls no browser dep, so on a fresh install the first browser op
  // hits this path and gets an actionable install hint — not an opaque crash.
  test.skipIf(HAS_PLAYWRIGHT)('surfaces a classified engine-unavailable error with an install hint', async () => {
    let caught: unknown
    try {
      await loadPlaywrightEngine()
    } catch (err) {
      caught = err
    }
    expect(isBrowserOpError(caught)).toBe(true)
    if (isBrowserOpError(caught)) {
      expect(caught.kind).toBe('engine-unavailable')
      expect(caught.message).toContain('playwright install chromium')
    }
  })
})
