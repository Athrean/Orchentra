import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

let cached: ReturnType<typeof drizzle<typeof schema>> | null = null

export function getGraphDb() {
  if (cached) return cached

  const connectionString = process.env.GRAPH_DATABASE_URL ?? process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('GRAPH_DATABASE_URL or DATABASE_URL is required for the graph read connection')
  }

  const client = postgres(connectionString, { prepare: false })
  cached = drizzle(client, { schema })
  return cached
}

export const graphDb = new Proxy({} as ReturnType<typeof getGraphDb>, {
  get(_target, prop, receiver) {
    return Reflect.get(getGraphDb(), prop, receiver)
  },
})

export type GraphDb = ReturnType<typeof getGraphDb>
