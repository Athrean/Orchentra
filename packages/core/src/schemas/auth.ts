import { z } from 'zod'

export const UserSchema = z.object({
  id: z.string().uuid(),
  githubId: z.number().int(),
  username: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().url().nullable(),
  email: z.string().email().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export type User = z.infer<typeof UserSchema>

export const SessionSchema = z.object({
  id: z.string(),
  userId: z.string().uuid(),
  expiresAt: z.coerce.date(),
  createdAt: z.coerce.date(),
})

export type Session = z.infer<typeof SessionSchema>

export const LoginResponseSchema = z.object({
  user: UserSchema.pick({
    id: true,
    username: true,
    displayName: true,
    avatarUrl: true,
  }),
})

export type LoginResponse = z.infer<typeof LoginResponseSchema>

export const MeResponseSchema = z.object({
  user: UserSchema.pick({
    id: true,
    githubId: true,
    username: true,
    displayName: true,
    avatarUrl: true,
    email: true,
  }),
})

export type MeResponse = z.infer<typeof MeResponseSchema>

export const LogoutResponseSchema = z.object({
  success: z.boolean(),
})

export type LogoutResponse = z.infer<typeof LogoutResponseSchema>
