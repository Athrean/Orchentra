import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

let cached: ReturnType<typeof drizzle<typeof schema>> | null = null

export function getDb() {
  if (cached) return cached
  // WEB_DATABASE_URL only — never fall back to the server's DATABASE_URL, which
  // points at a non-Supabase Postgres without the auth.users schema this app needs.
  const connectionString = process.env.WEB_DATABASE_URL
  if (!connectionString) throw new Error('WEB_DATABASE_URL is required (Supabase Postgres connection string)')
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
