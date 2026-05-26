import { z } from 'zod'

export const profileEditSchema = z.object({
  username: z.string().min(2).max(40).nullable().optional(),
  fullName: z.string().min(1).max(80).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
})

export const llmKeySchema = z.object({
  llmProvider: z.enum(['anthropic', 'openai']),
  apiKey: z.string().min(20, 'API key looks too short').max(512),
})

export type ProfileEdit = z.infer<typeof profileEditSchema>
export type LlmKey = z.infer<typeof llmKeySchema>
