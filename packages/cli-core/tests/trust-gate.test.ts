import { describe, expect, test } from 'bun:test'
import { createTrustStore } from '../src/trust/store'
import { enforceTrust, type TrustChoice } from '../src/trust/gate'

function asker(choice: TrustChoice): { ask: (cwd: string) => Promise<TrustChoice>; calls: number } {
  let calls = 0
  return {
    ask: async () => {
      calls++
      return choice
    },
    get calls() {
      return calls
    },
  }
}

describe('enforceTrust', () => {
  test('already trusted → returns trusted, no prompt', async () => {
    const store = createTrustStore()
    store.trust('/repo/a')
    const a = asker('deny')
    const v = await enforceTrust({ cwd: '/repo/a', store, askUser: a.ask })
    expect(v).toBe('trusted')
    expect(a.calls).toBe(0)
  })

  test('already denied → returns denied, no prompt', async () => {
    const store = createTrustStore()
    store.deny('/tmp/sus')
    const a = asker('trust')
    const v = await enforceTrust({ cwd: '/tmp/sus', store, askUser: a.ask })
    expect(v).toBe('denied')
    expect(a.calls).toBe(0)
  })

  test('unknown + trust choice → persists trust, returns trusted', async () => {
    const store = createTrustStore()
    const a = asker('trust')
    const v = await enforceTrust({ cwd: '/repo/new', store, askUser: a.ask })
    expect(v).toBe('trusted')
    expect(store.status('/repo/new')).toBe('trusted')
    expect(a.calls).toBe(1)
  })

  test('unknown + deny choice → persists deny, returns denied', async () => {
    const store = createTrustStore()
    const a = asker('deny')
    const v = await enforceTrust({ cwd: '/repo/new', store, askUser: a.ask })
    expect(v).toBe('denied')
    expect(store.status('/repo/new')).toBe('denied')
  })

  test('unknown + cancel choice → returns cancelled, no persistence', async () => {
    const store = createTrustStore()
    const a = asker('cancel')
    const v = await enforceTrust({ cwd: '/repo/new', store, askUser: a.ask })
    expect(v).toBe('cancelled')
    expect(store.status('/repo/new')).toBe('unknown')
  })
})
