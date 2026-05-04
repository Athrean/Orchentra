import { resolveTrust } from './resolver'
import type { TrustStore } from './store'

export type TrustChoice = 'trust' | 'deny' | 'cancel'
export type TrustVerdict = 'trusted' | 'denied' | 'cancelled'

export interface EnforceTrustOptions {
  readonly cwd: string
  readonly store: TrustStore
  readonly askUser: (cwd: string) => Promise<TrustChoice>
}

export async function enforceTrust(opts: EnforceTrustOptions): Promise<TrustVerdict> {
  const status = resolveTrust(opts.cwd, opts.store)
  if (status === 'trusted') return 'trusted'
  if (status === 'denied') return 'denied'

  const choice = await opts.askUser(opts.cwd)
  if (choice === 'trust') {
    opts.store.trust(opts.cwd)
    return 'trusted'
  }
  if (choice === 'deny') {
    opts.store.deny(opts.cwd)
    return 'denied'
  }
  return 'cancelled'
}
