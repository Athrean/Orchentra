import { z } from 'zod'
import { efforts } from './effort'

export const permissionModes = ['ask', 'act'] as const
export type PermissionMode = (typeof permissionModes)[number]

/**
 * Request body for POST /api/chat. `messages` are AI SDK `UIMessage[]` sent by useChat;
 * the remaining fields are the chat-input selections forwarded via the transport body.
 * Unknown transport keys (trigger, messageId, id) are ignored.
 */
export const chatBodySchema = z.object({
  messages: z.array(z.unknown()).min(1).max(100),
  model: z.string().min(1).max(100).optional(),
  effort: z.enum(efforts).default('low'),
  adaptive: z.boolean().default(false),
  permissionMode: z.enum(permissionModes).default('ask'),
  scope: z.string().max(200).optional(),
})

export type ChatBody = z.infer<typeof chatBodySchema>
