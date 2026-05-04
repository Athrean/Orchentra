export interface Recipe {
  readonly name: string
  readonly matcher: (err: unknown) => boolean
}

export interface WithRecoveryOptions {
  readonly recipes?: readonly Recipe[]
  readonly maxRetries?: number
  readonly baseMs?: number
  readonly capMs?: number
  readonly sleep?: (ms: number) => Promise<void>
  readonly onRetry?: (info: { attempt: number; delay: number; error: unknown; recipe: string }) => void
}

export class RecoveryGiveUpError extends Error {
  readonly attempts: number
  readonly elapsedMs: number
  readonly recipe: string
  override readonly cause: unknown

  constructor(opts: { attempts: number; elapsedMs: number; recipe: string; cause: unknown }) {
    super(
      `recovery (${opts.recipe}): tried ${opts.attempts} times over ${opts.elapsedMs}ms, still failing: ${describe(opts.cause)}`,
    )
    this.name = 'RecoveryGiveUpError'
    this.attempts = opts.attempts
    this.elapsedMs = opts.elapsedMs
    this.recipe = opts.recipe
    this.cause = opts.cause
  }
}

export const builtinRecipes: readonly Recipe[] = [
  {
    name: 'http_429',
    matcher: (err) => readNumber(err, 'status') === 429 || /\b429\b/.test(messageOf(err)),
  },
  {
    name: 'econn_reset',
    matcher: (err) => readString(err, 'code') === 'ECONNRESET',
  },
  {
    name: 'etimedout',
    matcher: (err) => readString(err, 'code') === 'ETIMEDOUT',
  },
]

const DEFAULT_BASE_MS = 100
const DEFAULT_CAP_MS = 5000
const DEFAULT_MAX_RETRIES = 3

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export async function withRecovery<T>(fn: () => Promise<T>, opts: WithRecoveryOptions = {}): Promise<T> {
  const recipes = opts.recipes ?? builtinRecipes
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES
  const baseMs = opts.baseMs ?? DEFAULT_BASE_MS
  const capMs = opts.capMs ?? DEFAULT_CAP_MS
  const sleep = opts.sleep ?? realSleep
  const start = Date.now()

  let attempt = 0
  let lastErr: unknown
  let lastRecipe = ''

  for (;;) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const recipe = recipes.find((r) => r.matcher(err))
      if (!recipe) throw err
      lastRecipe = recipe.name
      attempt++
      if (attempt > maxRetries) {
        throw new RecoveryGiveUpError({
          attempts: attempt,
          elapsedMs: Date.now() - start,
          recipe: lastRecipe,
          cause: lastErr,
        })
      }
      const delay = Math.min(baseMs * 2 ** (attempt - 1), capMs)
      opts.onRetry?.({ attempt, delay, error: err, recipe: recipe.name })
      await sleep(delay)
    }
  }
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

function readNumber(err: unknown, key: string): number | undefined {
  if (err && typeof err === 'object' && key in err) {
    const v = (err as Record<string, unknown>)[key]
    if (typeof v === 'number') return v
  }
  return undefined
}

function readString(err: unknown, key: string): string | undefined {
  if (err && typeof err === 'object' && key in err) {
    const v = (err as Record<string, unknown>)[key]
    if (typeof v === 'string') return v
  }
  return undefined
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
