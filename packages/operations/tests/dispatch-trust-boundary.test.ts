import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { dispatch, OperationError, type Operation, type OperationContext } from '../src'

const writeOp: Operation<{ msg: string }, { ok: true }> = {
  id: 'fixture_write',
  description: 'fixture write op',
  scope: 'write',
  mutating: true,
  localOnly: false,
  parameters: z.object({ msg: z.string() }),
  handler: async () => ({ ok: true }),
}

describe('dispatch trust boundary', () => {
  test('rejects write-scoped op when ctx.remote is true and no approval', async () => {
    const ctx: OperationContext = { remote: true }

    let caught: unknown
    try {
      await dispatch(writeOp, ctx, { msg: 'hi' })
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(OperationError)
    expect((caught as OperationError).code).toBe('permission_denied')
  })

  test('runs read-scoped handler when ctx.remote is true', async () => {
    let handlerCalled = false
    const readOp: Operation<{ q: string }, { hits: number }> = {
      id: 'fixture_read',
      description: 'fixture read op',
      scope: 'read',
      mutating: false,
      localOnly: false,
      parameters: z.object({ q: z.string() }),
      handler: async () => {
        handlerCalled = true
        return { hits: 1 }
      },
    }

    const result = await dispatch(readOp, { remote: true }, { q: 'orchentra' })

    expect(handlerCalled).toBe(true)
    expect(result).toEqual({ hits: 1 })
  })

  test('runs write-scoped handler when ctx.remote is strictly false', async () => {
    let handlerCalled = false
    const op: Operation<{ msg: string }, { ok: true }> = {
      ...writeOp,
      handler: async () => {
        handlerCalled = true
        return { ok: true }
      },
    }

    const result = await dispatch(op, { remote: false }, { msg: 'hi' })

    expect(handlerCalled).toBe(true)
    expect(result).toEqual({ ok: true })
  })

  test('rejects localOnly op when ctx.remote is not strictly false', async () => {
    const localOp: Operation<{ path: string }, { ok: true }> = {
      id: 'fixture_local_only',
      description: 'fixture local-only op',
      scope: 'read',
      mutating: false,
      localOnly: true,
      parameters: z.object({ path: z.string() }),
      handler: async () => ({ ok: true }),
    }

    let caught: unknown
    try {
      await dispatch(localOp, { remote: true }, { path: '/etc/hosts' })
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(OperationError)
    expect((caught as OperationError).code).toBe('permission_denied')
  })

  test('rejects write-scoped op when ctx.remote is missing at runtime', async () => {
    const malformedCtx = {} as unknown as OperationContext

    let caught: unknown
    try {
      await dispatch(writeOp, malformedCtx, { msg: 'hi' })
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(OperationError)
    expect((caught as OperationError).code).toBe('permission_denied')
  })

  test('rejects write-scoped op when ctx.remote is null at runtime', async () => {
    const malformedCtx = { remote: null as unknown as boolean }

    let caught: unknown
    try {
      await dispatch(writeOp, malformedCtx, { msg: 'hi' })
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(OperationError)
    expect((caught as OperationError).code).toBe('permission_denied')
  })

  test('rejects write-scoped op when ctx.remote is the string "false"', async () => {
    const malformedCtx = { remote: 'false' as unknown as boolean }

    let caught: unknown
    try {
      await dispatch(writeOp, malformedCtx, { msg: 'hi' })
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(OperationError)
    expect((caught as OperationError).code).toBe('permission_denied')
  })

  test('runs localOnly op when ctx.remote is strictly false', async () => {
    let handlerCalled = false
    const localOp: Operation<{ path: string }, { ok: true }> = {
      id: 'fixture_local_only_ok',
      description: 'fixture local-only op',
      scope: 'read',
      mutating: false,
      localOnly: true,
      parameters: z.object({ path: z.string() }),
      handler: async () => {
        handlerCalled = true
        return { ok: true }
      },
    }

    const result = await dispatch(localOp, { remote: false }, { path: '/etc/hosts' })

    expect(handlerCalled).toBe(true)
    expect(result).toEqual({ ok: true })
  })

  test('runs write-scoped op when ctx.remote is true and approval callback returns true', async () => {
    let approvalArgs: { opId: string; params: unknown } | null = null
    const ctx: OperationContext = {
      remote: true,
      approval: async (op, params) => {
        approvalArgs = { opId: op.id, params }
        return true
      },
    }

    const result = await dispatch(writeOp, ctx, { msg: 'hi' })

    expect(result).toEqual({ ok: true })
    expect(approvalArgs).toEqual({ opId: 'fixture_write', params: { msg: 'hi' } })
  })

  test('rejects write-scoped op when ctx.remote is true and approval callback returns false', async () => {
    const ctx: OperationContext = {
      remote: true,
      approval: async () => false,
    }

    let caught: unknown
    try {
      await dispatch(writeOp, ctx, { msg: 'hi' })
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(OperationError)
    expect((caught as OperationError).code).toBe('permission_denied')
  })

  test('approval callback is bypassed for read-scoped ops on remote ctx', async () => {
    let approvalCalled = false
    const ctx: OperationContext = {
      remote: true,
      approval: async () => {
        approvalCalled = true
        return false
      },
    }
    const readOp: Operation<{ q: string }, { hits: number }> = {
      id: 'fixture_read_no_approval',
      description: '',
      scope: 'read',
      mutating: false,
      localOnly: false,
      parameters: z.object({ q: z.string() }),
      handler: async () => ({ hits: 1 }),
    }

    const result = await dispatch(readOp, ctx, { q: 'orchentra' })

    expect(result).toEqual({ hits: 1 })
    expect(approvalCalled).toBe(false)
  })

  test('approval callback is consulted for admin-scoped ops too', async () => {
    let approvalCalled = false
    const adminOp: Operation<Record<string, never>, { ok: true }> = {
      id: 'fixture_admin',
      description: '',
      scope: 'admin',
      mutating: true,
      localOnly: false,
      parameters: z.object({}),
      handler: async () => ({ ok: true }),
    }
    const ctx: OperationContext = {
      remote: true,
      approval: async () => {
        approvalCalled = true
        return true
      },
    }

    const result = await dispatch(adminOp, ctx, {})

    expect(result).toEqual({ ok: true })
    expect(approvalCalled).toBe(true)
  })

  test('approval callback is ignored when ctx.remote is false (local always allowed)', async () => {
    let approvalCalled = false
    const ctx: OperationContext = {
      remote: false,
      approval: async () => {
        approvalCalled = true
        return false
      },
    }

    const result = await dispatch(writeOp, ctx, { msg: 'hi' })

    expect(result).toEqual({ ok: true })
    expect(approvalCalled).toBe(false)
  })

  test('approval callback can return a structured awaiting_approval decision', async () => {
    const ctx: OperationContext = {
      remote: true,
      approval: async () => ({
        status: 'awaiting_approval',
        approvalId: 'apr_123',
        expiresAt: '2026-01-01T00:00:00Z',
        reason: 'queued for human review',
      }),
    }

    let caught: unknown
    try {
      await dispatch(writeOp, ctx, { msg: 'hi' })
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(OperationError)
    const err = caught as OperationError
    expect(err.code).toBe('awaiting_approval')
    expect(err.message).toContain('queued for human review')
    expect(err.suggestion).toContain('apr_123')
    expect(err.docs).toContain('apr_123')
    expect(err.docs).toContain('2026-01-01T00:00:00Z')
  })

  test('approval callback returning structured approved decision runs the handler', async () => {
    let handlerCalled = false
    const op: Operation<{ msg: string }, { ok: true }> = {
      ...writeOp,
      handler: async () => {
        handlerCalled = true
        return { ok: true }
      },
    }
    const ctx: OperationContext = {
      remote: true,
      approval: async () => ({ status: 'approved' }),
    }

    const result = await dispatch(op, ctx, { msg: 'hi' })

    expect(result).toEqual({ ok: true })
    expect(handlerCalled).toBe(true)
  })

  test('approval callback returning structured denied decision throws permission_denied', async () => {
    const ctx: OperationContext = {
      remote: true,
      approval: async () => ({ status: 'denied', reason: 'policy violation: forbidden repo' }),
    }

    let caught: unknown
    try {
      await dispatch(writeOp, ctx, { msg: 'hi' })
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(OperationError)
    const err = caught as OperationError
    expect(err.code).toBe('permission_denied')
    expect(err.message).toContain('policy violation')
  })

  test('localOnly op with remote=true still rejected even when approval returns true', async () => {
    const localOp: Operation<{ path: string }, { ok: true }> = {
      id: 'fixture_local_only_no_approval_bypass',
      description: '',
      scope: 'read',
      mutating: false,
      localOnly: true,
      parameters: z.object({ path: z.string() }),
      handler: async () => ({ ok: true }),
    }
    const ctx: OperationContext = {
      remote: true,
      approval: async () => true,
    }

    let caught: unknown
    try {
      await dispatch(localOp, ctx, { path: '/etc/hosts' })
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(OperationError)
    expect((caught as OperationError).code).toBe('permission_denied')
  })
})
