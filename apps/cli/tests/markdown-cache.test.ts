import { describe, expect, test } from 'bun:test'
import { LruCache } from '../src/tui/markdown/cache'

describe('LruCache', () => {
  test('stores and retrieves values by key', () => {
    const cache = new LruCache<string, number>(3)
    cache.set('a', 1)
    cache.set('b', 2)
    expect(cache.get('a')).toBe(1)
    expect(cache.get('b')).toBe(2)
    expect(cache.size).toBe(2)
  })

  test('returns undefined for missing keys', () => {
    const cache = new LruCache<string, number>(3)
    expect(cache.get('missing')).toBeUndefined()
  })

  test('evicts the least-recently-used entry when at capacity', () => {
    const cache = new LruCache<string, number>(2)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3) // evicts 'a'
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe(2)
    expect(cache.get('c')).toBe(3)
    expect(cache.size).toBe(2)
  })

  test('get promotes an entry to most-recently-used', () => {
    const cache = new LruCache<string, number>(2)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.get('a') // 'a' is now MRU; 'b' becomes LRU
    cache.set('c', 3) // evicts 'b'
    expect(cache.get('a')).toBe(1)
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('c')).toBe(3)
  })

  test('set on existing key updates value and refreshes recency', () => {
    const cache = new LruCache<string, number>(2)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('a', 11) // refresh 'a' as MRU; 'b' becomes LRU
    cache.set('c', 3) // evicts 'b'
    expect(cache.get('a')).toBe(11)
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('c')).toBe(3)
    expect(cache.size).toBe(2)
  })
})
