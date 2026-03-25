import { describe, test, expect } from 'bun:test'
import { MonitorRepoRequestSchema } from '@orchentra/core'

describe('MonitorRepoRequestSchema', () => {
  test('accepts valid owner/repo format', () => {
    const result = MonitorRepoRequestSchema.safeParse({ repo: 'my-org/api' })
    expect(result.success).toBe(true)
  })

  test('accepts repos with dots and hyphens', () => {
    const result = MonitorRepoRequestSchema.safeParse({ repo: 'my-org/my.project' })
    expect(result.success).toBe(true)
  })

  test('rejects bare repo name without owner', () => {
    const result = MonitorRepoRequestSchema.safeParse({ repo: 'just-a-repo' })
    expect(result.success).toBe(false)
  })

  test('rejects empty string', () => {
    const result = MonitorRepoRequestSchema.safeParse({ repo: '' })
    expect(result.success).toBe(false)
  })

  test('rejects repo with spaces', () => {
    const result = MonitorRepoRequestSchema.safeParse({ repo: 'my org/api' })
    expect(result.success).toBe(false)
  })
})
