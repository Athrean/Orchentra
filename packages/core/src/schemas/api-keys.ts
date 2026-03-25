import { z } from 'zod'

export const CreateApiKeyRequestSchema = z.object({
  name: z.string().min(1).max(100),
  expiresAt: z.coerce
    .date()
    .refine((d) => d > new Date(), { message: 'expiresAt must be in the future' })
    .optional(),
})

export type CreateApiKeyRequest = z.infer<typeof CreateApiKeyRequestSchema>

export const CreateApiKeyResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  key: z.string(),
  keyPrefix: z.string(),
  expiresAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
})

export type CreateApiKeyResponse = z.infer<typeof CreateApiKeyResponseSchema>

export const ApiKeyListItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  keyPrefix: z.string(),
  lastUsedAt: z.coerce.date().nullable(),
  expiresAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
})

export type ApiKeyListItem = z.infer<typeof ApiKeyListItemSchema>

export const ApiKeyListResponseSchema = z.object({
  keys: z.array(ApiKeyListItemSchema),
})

export type ApiKeyListResponse = z.infer<typeof ApiKeyListResponseSchema>
