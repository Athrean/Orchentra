import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL ?? 'postgresql://orchentra:orchentra@localhost:5432/orchentra'

const sql = postgres(connectionString)

export const db = drizzle(sql, { schema })

export async function runMigrations(): Promise<void> {
  const migrationClient = postgres(connectionString, { max: 1 })
  try {
    const migrationDb = drizzle(migrationClient)
    const migrationsDir = dirname(fileURLToPath(import.meta.url))
    await migrate(migrationDb, { migrationsFolder: join(migrationsDir, 'migrations') })
    console.log('✅ Database migrations applied')
  } finally {
    await migrationClient.end()
  }
}
