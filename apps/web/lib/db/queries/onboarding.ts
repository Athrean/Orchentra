import { eq } from 'drizzle-orm'
import { db } from '../client'
import { onboardingState, type OnboardingState, type OnboardingStep } from '../schema'

export async function getOnboardingState(userId: string): Promise<OnboardingState | null> {
  const [row] = await db.select().from(onboardingState).where(eq(onboardingState.userId, userId)).limit(1)
  return row ?? null
}

export async function getOrCreateOnboardingState(userId: string): Promise<OnboardingState> {
  const existing = await getOnboardingState(userId)
  if (existing) return existing
  const [row] = await db.insert(onboardingState).values({ userId, step: 'welcome' }).onConflictDoNothing().returning()
  if (row) return row
  const refetched = await getOnboardingState(userId)
  if (!refetched) throw new Error('failed to create onboarding_state row')
  return refetched
}

export async function setOnboardingStep(userId: string, step: OnboardingStep): Promise<OnboardingState> {
  const values: { step: OnboardingStep; completedAt?: Date } = { step }
  if (step === 'completed') values.completedAt = new Date()
  const [row] = await db.update(onboardingState).set(values).where(eq(onboardingState.userId, userId)).returning()
  if (!row) throw new Error('onboarding_state row missing for user')
  return row
}
