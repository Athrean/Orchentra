'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '../../../../lib/supabase/server'
import { deleteProviderCredential, saveProviderCredential } from '../../../../lib/ai-providers/credential-store'
import { getProviderCatalogItem, isCatalogModel, providerIdSchema } from '../../../../lib/ai-providers/catalog'
import { validateProviderKey } from '../../../../lib/ai-providers/key-tester'

const providerCredentialSchema = z
  .object({
    provider: providerIdSchema,
    apiKey: z.string().min(8, 'API key looks too short').max(2048),
    baseUrl: z.string().url('Base URL must be a valid URL').optional().or(z.literal('')),
    defaultModel: z.string().min(1).max(160),
  })
  .superRefine((input, ctx) => {
    if (!isCatalogModel(input.provider, input.defaultModel)) {
      ctx.addIssue({
        code: 'custom',
        path: ['defaultModel'],
        message: 'Choose a supported default model for this provider',
      })
    }
  })

async function requireUserId(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  return user.id
}

export async function saveProviderCredentialAction(input: z.input<typeof providerCredentialSchema>) {
  const parsed = providerCredentialSchema.parse(input)
  const userId = await requireUserId()
  const catalogItem = getProviderCatalogItem(parsed.provider)

  await saveProviderCredential({
    userId,
    provider: parsed.provider,
    apiKey: parsed.apiKey,
    baseUrl: parsed.baseUrl || catalogItem.defaultBaseUrl,
    defaultModel: parsed.defaultModel,
  })

  revalidatePath('/settings/ai-providers')
}

export async function deleteProviderCredentialAction(provider: z.input<typeof providerIdSchema>) {
  const parsed = providerIdSchema.parse(provider)
  const userId = await requireUserId()
  await deleteProviderCredential(userId, parsed)
  revalidatePath('/settings/ai-providers')
}

export async function testProviderCredentialAction(input: z.input<typeof providerCredentialSchema>) {
  const parsed = providerCredentialSchema.parse(input)
  await requireUserId()
  const catalogItem = getProviderCatalogItem(parsed.provider)

  return validateProviderKey({
    provider: parsed.provider,
    apiKey: parsed.apiKey,
    baseUrl: parsed.baseUrl || catalogItem.defaultBaseUrl,
  })
}
