import { describe, test, expect } from 'bun:test'
import { CreateApiKeyRequestSchema } from '@orchentra/core'

describe('CreateApiKeyRequestSchema', () => {
  test('accepts valid name', () => {
    const result = CreateApiKeyRequestSchema.safeParse({ name: 'CI scripts' })
    expect(result.success).toBe(true)
  })

  test('accepts name with optional expiresAt', () => {
    const result = CreateApiKeyRequestSchema.safeParse({
      name: 'Deploy key',
      expiresAt: '2026-12-31T00:00:00Z',
    })
    expect(result.success).toBe(true)
  })

  test('rejects empty name', () => {
    const result = CreateApiKeyRequestSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })

  test('rejects missing name', () => {
    const result = CreateApiKeyRequestSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})
