import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { monitoredRepos } from '../db/schema'

export const repoSelectSchema = createSelectSchema(monitoredRepos)
export const repoInsertSchema = createInsertSchema(monitoredRepos)

const slug = /^[A-Za-z0-9._-]+$/

export const addRepoSchema = z.object({
  owner: z.string().min(1).max(60).regex(slug, 'Invalid GitHub owner'),
  name: z.string().min(1).max(100).regex(slug, 'Invalid repo name'),
  defaultBranch: z.string().min(1).max(120).optional(),
  githubInstallationId: z.number().int().positive().optional(),
})

export type AddRepoInput = z.infer<typeof addRepoSchema>
