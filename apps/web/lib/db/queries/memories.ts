import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { db } from '../client'
import { userMemories, type UserMemory } from '../schema'

export interface NewMemoryInput {
  repo?: string
  title: string
  content: string
  tags?: string[]
}

export async function listMemories(userId: string, limit = 100): Promise<UserMemory[]> {
  return db
    .select()
    .from(userMemories)
    .where(eq(userMemories.userId, userId))
    .orderBy(desc(userMemories.updatedAt))
    .limit(limit)
}

export async function insertMemory(userId: string, input: NewMemoryInput): Promise<UserMemory> {
  const [row] = await db
    .insert(userMemories)
    .values({
      userId,
      repo: input.repo ?? null,
      title: input.title,
      content: input.content,
      tags: input.tags ?? [],
    })
    .returning()
  return row
}

export async function deleteMemory(userId: string, id: string): Promise<void> {
  await db.delete(userMemories).where(and(eq(userMemories.userId, userId), eq(userMemories.id, id)))
}

/** Recall memories for a user, optionally narrowed by repo or a text query. */
export async function recallMemories(
  userId: string,
  opts: { repo?: string; query?: string; limit?: number } = {},
): Promise<UserMemory[]> {
  const filters = [eq(userMemories.userId, userId)]
  if (opts.repo) filters.push(eq(userMemories.repo, opts.repo))
  if (opts.query) {
    const like = `%${opts.query}%`
    const match = or(ilike(userMemories.title, like), ilike(userMemories.content, like))
    if (match) filters.push(match)
  }

  const rows = await db
    .select()
    .from(userMemories)
    .where(and(...filters))
    .orderBy(desc(userMemories.updatedAt))
    .limit(opts.limit ?? 10)

  if (rows.length > 0) {
    await db
      .update(userMemories)
      .set({ lastRecalledAt: sql`now()` })
      .where(
        and(
          eq(userMemories.userId, userId),
          inArray(
            userMemories.id,
            rows.map((row) => row.id),
          ),
        ),
      )
  }

  return rows
}
