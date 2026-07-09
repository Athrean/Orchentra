import { describe, expect, test } from 'bun:test'
import { injectCacheBoundary } from '../src/anthropic/cache'

describe('injectCacheBoundary', () => {
  test('emits static + dynamic blocks', () => {
    const blocks = injectCacheBoundary('static rules', 'dynamic notes')
    expect(blocks).toEqual([
      { type: 'text', text: 'static rules', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'dynamic notes' },
    ])
  })

  test('omits empty static and dynamic blocks', () => {
    expect(injectCacheBoundary('', '')).toEqual([])
  })
})
