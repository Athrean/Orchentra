import type { users } from './db/client'

export type UserRow = typeof users.$inferSelect

export interface AppVariables {
  user: UserRow
}
