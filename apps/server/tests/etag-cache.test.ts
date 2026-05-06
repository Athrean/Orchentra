import { describe, expect, test } from 'bun:test'
import { ETagCache, conditionalRequest } from '../src/github/etag-cache'

describe('ETagCache', () => {
  test('round-trips set + get', () => {
    const cache = new ETagCache<{ n: number }>()
    cache.set('k', { etag: 'W/"abc"', body: { n: 1 } })
    expect(cache.get('k')?.body).toEqual({ n: 1 })
    expect(cache.get('k')?.etag).toBe('W/"abc"')
  })

  test('LRU evicts oldest entry past maxEntries', () => {
    const cache = new ETagCache<number>({ maxEntries: 2 })
    cache.set('a', { etag: '"1"', body: 1 })
    cache.set('b', { etag: '"2"', body: 2 })
    cache.set('c', { etag: '"3"', body: 3 })
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')?.body).toBe(2)
    expect(cache.get('c')?.body).toBe(3)
  })

  test('get refreshes LRU position so recently-read entries survive', () => {
    const cache = new ETagCache<number>({ maxEntries: 2 })
    cache.set('a', { etag: '"1"', body: 1 })
    cache.set('b', { etag: '"2"', body: 2 })
    // Touch 'a' so 'b' becomes the eviction candidate.
    cache.get('a')
    cache.set('c', { etag: '"3"', body: 3 })
    expect(cache.get('a')?.body).toBe(1)
    expect(cache.get('b')).toBeUndefined()
  })

  test('key composes orgId + method + url with case-normalised method', () => {
    expect(ETagCache.key('org-1', 'get', '/repos/x/y')).toBe('org-1:GET:/repos/x/y')
    expect(ETagCache.key(null, 'POST', '/foo')).toBe('_global:POST:/foo')
  })
})

describe('conditionalRequest', () => {
  test('first call stores etag + body; second call returns cached body on 304', async () => {
    const cache = new ETagCache<{ msg: string }>()
    let calls = 0
    const requester = async (
      headers: Record<string, string>,
    ): Promise<{ status: number; data: unknown; headers: Record<string, string | undefined> }> => {
      calls += 1
      if (calls === 1) {
        return { status: 200, data: { msg: 'fresh' }, headers: { etag: 'W/"v1"' } }
      }
      // Verify the conditional header was sent on the second call.
      expect(headers['If-None-Match']).toBe('W/"v1"')
      return { status: 304, data: undefined, headers: {} }
    }

    const first = await conditionalRequest<{ msg: string }>({
      orgId: 'org-1',
      method: 'GET',
      url: '/foo',
      requester,
      cache,
    })
    expect(first.fromCache).toBe(false)
    expect(first.status).toBe(200)
    expect(first.data).toEqual({ msg: 'fresh' })
    expect(first.etag).toBe('W/"v1"')

    const second = await conditionalRequest<{ msg: string }>({
      orgId: 'org-1',
      method: 'GET',
      url: '/foo',
      requester,
      cache,
    })
    expect(second.fromCache).toBe(true)
    expect(second.status).toBe(304)
    expect(second.data).toEqual({ msg: 'fresh' })
    expect(second.etag).toBe('W/"v1"')
  })

  test('different orgs do not share cache entries', async () => {
    const cache = new ETagCache<{ owner: string }>()
    const seedFor = async (org: string): Promise<void> => {
      await conditionalRequest({
        orgId: org,
        method: 'GET',
        url: '/repos/shared',
        requester: async () => ({
          status: 200,
          data: { owner: org },
          headers: { etag: `W/"${org}"` },
        }),
        cache,
      })
    }
    await seedFor('org-a')
    await seedFor('org-b')

    const orgA = cache.get(ETagCache.key('org-a', 'GET', '/repos/shared'))
    const orgB = cache.get(ETagCache.key('org-b', 'GET', '/repos/shared'))
    expect(orgA?.body).toEqual({ owner: 'org-a' })
    expect(orgB?.body).toEqual({ owner: 'org-b' })
  })

  test('updates cached body when a non-304 response carries a new etag', async () => {
    const cache = new ETagCache<{ v: number }>()
    let version = 1
    const requester = async (): Promise<{
      status: number
      data: unknown
      headers: Record<string, string | undefined>
    }> => {
      const v = version
      version += 1
      return { status: 200, data: { v }, headers: { etag: `W/"v${v}"` } }
    }
    await conditionalRequest({ orgId: null, method: 'GET', url: '/foo', requester, cache })
    await conditionalRequest({ orgId: null, method: 'GET', url: '/foo', requester, cache })
    expect(cache.get(ETagCache.key(null, 'GET', '/foo'))?.body).toEqual({ v: 2 })
  })
})
