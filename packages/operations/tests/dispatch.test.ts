import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { dispatch, OperationError, type Operation, type OperationContext } from '../src'

function localCtx(scopes: Array<'read' | 'write' | 'admin'> = ['read', 'write', 'admin']): OperationContext {
  return { remote: false, allowedScopes: new Set(scopes) }
}

function remoteCtx(scopes: Array<'read' | 'write' | 'admin'> = ['read', 'write', 'admin']): OperationContext {
  return { remote: true, allowedScopes: new Set(scopes) }
}

function readOp(): Operation<{ name: string }, { hello: string }> {
  return {
    id: 'mock_read_op',
    description: 'mock read op',
    scope: 'read',
    localOnly: false,
    mutating: false,
    parameters: z.object({ name: z.string() }),
    handler: async (_ctx, params) => ({ hello: params.name }),
  }
}

function writeOp(): Operation<{ body: string }, { posted: boolean }> {
  return {
    id: 'mock_write_op',
    description: 'mock write op',
    scope: 'write',
    localOnly: false,
    mutating: true,
    parameters: z.object({ body: z.string() }),
    handler: async () => ({ posted: true }),
  }
}

describe('dispatch', () => {
  test('runs a read-scoped op locally', async () => {
    const out = await dispatch(readOp(), localCtx(), { name: 'world' })
    expect(out).toEqual({ hello: 'world' })
  })

  test('runs a read-scoped op remotely', async () => {
    const out = await dispatch(readOp(), remoteCtx(), { name: 'remote' })
    expect(out).toEqual({ hello: 'remote' })
  })

  test('rejects a write-scoped op called by a remote caller without approval', async () => {
    let raised: OperationError | null = null
    try {
      await dispatch(writeOp(), remoteCtx(), { body: 'spam' })
    } catch (err) {
      raised = err as OperationError
    }
    expect(raised).toBeInstanceOf(OperationError)
    expect(raised?.code).toBe('permission_denied')
  })

  test('runs a write-scoped op called by a local caller', async () => {
    const out = await dispatch(writeOp(), localCtx(), { body: 'comment text' })
    expect(out).toEqual({ posted: true })
  })

  test('rejects malformed params with invalid_input', async () => {
    let raised: OperationError | null = null
    try {
      await dispatch(readOp(), localCtx(), { name: 42 })
    } catch (err) {
      raised = err as OperationError
    }
    expect(raised?.code).toBe('invalid_input')
  })

  test('wraps non-OperationError handler throws as internal_error', async () => {
    const op: Operation<Record<string, never>, never> = {
      id: 'broken_op',
      description: '',
      scope: 'read',
      localOnly: false,
      mutating: false,
      parameters: z.object({}),
      handler: async () => {
        throw new Error('boom')
      },
    }
    let raised: OperationError | null = null
    try {
      await dispatch(op, localCtx(), {})
    } catch (err) {
      raised = err as OperationError
    }
    expect(raised?.code).toBe('internal_error')
    expect(raised?.message).toBe('boom')
  })

  test('rejects local-only op when called remotely', async () => {
    const op: Operation<Record<string, never>, void> = {
      id: 'local_only_op',
      description: '',
      scope: 'read',
      localOnly: true,
      mutating: false,
      parameters: z.object({}),
      handler: async () => undefined,
    }
    let raised: OperationError | null = null
    try {
      await dispatch(op, remoteCtx(), {})
    } catch (err) {
      raised = err as OperationError
    }
    expect(raised?.code).toBe('permission_denied')
  })
})
