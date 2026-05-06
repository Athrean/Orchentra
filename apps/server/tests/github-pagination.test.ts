import { describe, expect, test } from 'bun:test'
import { paginateAll, DEFAULT_CAP } from '../src/github/pagination'
import type { OctokitLike } from '../src/github/octokit'

/** Bun-shaped fake of `octokit.paginate` that emits N items in batches of `perPage`. */
function fakeOctokitWithItems(total: number): OctokitLike {
  const fake: Partial<OctokitLike> = {
    paginate: (async (
      _endpoint: string,
      params: { per_page?: number },
      mapFn?: (resp: { data: unknown[] }, done?: () => void) => unknown,
    ) => {
      const perPage = params.per_page ?? 100
      let cursor = 0
      let stopped = false
      const done = (): void => {
        stopped = true
      }
      while (cursor < total && !stopped) {
        const slice = []
        const end = Math.min(cursor + perPage, total)
        for (let i = cursor; i < end; i += 1) slice.push({ id: i })
        if (mapFn) mapFn({ data: slice }, done)
        cursor = end
      }
      return []
    }) as unknown as OctokitLike['paginate'],
  }
  return fake as OctokitLike
}

describe('paginateAll', () => {
  test('returns all items when total is below the cap', async () => {
    const oct = fakeOctokitWithItems(42)
    const items = await paginateAll<{ id: number }>(oct, 'GET /repos/x/y/issues')
    expect(items).toHaveLength(42)
    expect(items[0]).toEqual({ id: 0 })
    expect(items[41]).toEqual({ id: 41 })
  })

  test('returns all items when total equals the cap', async () => {
    const oct = fakeOctokitWithItems(50)
    const items = await paginateAll<{ id: number }>(oct, 'GET /repos/x/y/issues', {}, { cap: 50, perPage: 10 })
    expect(items).toHaveLength(50)
  })

  test('throws when the cap is exceeded mid-page', async () => {
    const oct = fakeOctokitWithItems(120)
    await expect(
      paginateAll<{ id: number }>(oct, 'GET /repos/x/y/issues', {}, { cap: 50, perPage: 30 }),
    ).rejects.toThrow(/exceeded cap of 50/)
  })

  test('default cap is documented constant', () => {
    expect(DEFAULT_CAP).toBe(1000)
  })

  test('forwards custom parameters into octokit.paginate', async () => {
    let captured: Record<string, unknown> | null = null
    const fake = {
      paginate: (async (_endpoint: string, params: Record<string, unknown>) => {
        captured = params
        return []
      }) as unknown as OctokitLike['paginate'],
    } as OctokitLike
    await paginateAll(fake, 'GET /repos/x/y/issues', { state: 'open' }, { perPage: 25 })
    expect(captured).not.toBeNull()
    expect(captured!.state).toBe('open')
    expect(captured!.per_page).toBe(25)
  })
})
