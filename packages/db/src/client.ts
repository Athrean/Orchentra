import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL ?? 'postgresql://orchentra:orchentra@localhost:5432/orchentra'

const sql = postgres(connectionString)

export const db = drizzle(sql, { schema })

export async function runMigrations() {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  await migrate(db, { migrationsFolder: join(__dirname, 'migrations') })
  console.log('✅ Database migrations applied')
}
