import { z } from 'zod'

const repoPattern = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/

export const AvailableRepoSchema = z.object({
  fullName: z.string(),
  owner: z.string(),
  name: z.string(),
  private: z.boolean(),
  description: z.string().nullable(),
  monitored: z.boolean(),
})

export type AvailableRepo = z.infer<typeof AvailableRepoSchema>

export const AvailableReposResponseSchema = z.object({
  repos: z.array(AvailableRepoSchema),
})

export type AvailableReposResponse = z.infer<typeof AvailableReposResponseSchema>

export const MonitorRepoRequestSchema = z.object({
  repo: z.string().regex(repoPattern, 'Must be in owner/repo format'),
})

export type MonitorRepoRequest = z.infer<typeof MonitorRepoRequestSchema>

export const MonitoredRepoSchema = z.object({
  id: z.string().uuid(),
  repo: z.string(),
  addedBy: z.string().uuid().nullable(),
  createdAt: z.coerce.date(),
})

export type MonitoredRepo = z.infer<typeof MonitoredRepoSchema>
