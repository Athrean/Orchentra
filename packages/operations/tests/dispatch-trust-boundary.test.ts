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
})
