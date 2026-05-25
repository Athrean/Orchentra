import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

let cached: ReturnType<typeof drizzle<typeof schema>> | null = null

export function getDb() {
  if (cached) return cached
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is required')
  const client = postgres(connectionString, { prepare: false })
  cached = drizzle(client, { schema })
  return cached
}

export const db = new Proxy({} as ReturnType<typeof getDb>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver)
  },
})

export type Db = ReturnType<typeof getDb>
