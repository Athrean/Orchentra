import { z } from 'zod'

export const chatRoleSchema = z.enum(['system', 'user', 'assistant'])
export type ChatRole = z.infer<typeof chatRoleSchema>

export const chatMessageSchema = z.object({
  role: chatRoleSchema,
  content: z.string().min(1).max(50_000),
})
export type ChatMessage = z.infer<typeof chatMessageSchema>

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(50),
  model: z.string().min(1).max(100).optional(),
})
export type ChatRequest = z.infer<typeof chatRequestSchema>

export interface ChatChunk {
  type: 'token' | 'done' | 'error'
  text?: string
  error?: string
}
