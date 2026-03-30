import { Hono } from 'hono'
import { CreateApiKeyRequestSchema } from '@orchentra/core'
import { generateApiKey, hashApiKey } from '../auth/session'
import { getUserApiKeys, insertApiKey, findApiKeyById, deleteApiKey } from '../queries/api-keys'
import type { AppVariables } from '../types'

export const apiKeysRouter = new Hono<{ Variables: AppVariables }>()

apiKeysRouter.get('/', async (c) => {
  const user = c.get('user')
  const keys = await getUserApiKeys(user.id)
  return c.json({ keys })
})

apiKeysRouter.post('/', async (c) => {
  const user = c.get('user')
  const body = await c.req.json()
  const parsed = CreateApiKeyRequestSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const key = generateApiKey()
  const id = crypto.randomUUID()

  await insertApiKey({
    id,
    userId: user.id,
    name: parsed.data.name,
    keyHash: hashApiKey(key),
    keyPrefix: key.slice(0, 13), // "orch_" + 8 hex chars
    expiresAt: parsed.data.expiresAt ?? null,
  })

  return c.json(
    {
      id,
      name: parsed.data.name,
      key,
      keyPrefix: key.slice(0, 13),
      expiresAt: parsed.data.expiresAt ?? null,
      createdAt: new Date().toISOString(),
    },
    201,
  )
})

apiKeysRouter.delete('/:id', async (c) => {
  const user = c.get('user')
  const keyId = c.req.param('id')

  const existing = await findApiKeyById(keyId)
  if (!existing || existing.userId !== user.id) {
    return c.json({ error: 'API key not found' }, 404)
  }

  await deleteApiKey(keyId)
  return c.body(null, 204)
})
