import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import {
  requiresApproval,
  resolveTrustClass,
  validateActorCanApprove,
  type Operation,
  type OperationContext,
} from '../src'

function op(overrides: Partial<Operation<{ x: string }, { ok: true }>> = {}): Operation<{ x: string }, { ok: true }> {
  return {
    id: 'mock_op',
    description: '',
    scope: 'read',
    localOnly: false,
    mutating: false,
    parameters: z.object({ x: z.string() }),
    handler: async () => ({ ok: true }),
    ...overrides,
  }
}

describe('resolveTrustClass', () => {
  test('explicit trustClass wins over scope-derived default', () => {
    expect(resolveTrustClass({ scope: 'read', trustClass: 'destructive' })).toBe('destructive')
    expect(resolveTrustClass({ scope: 'write', trustClass: 'read' })).toBe('read')
  })

  test('scope=read defaults to read trust class', () => {
    expect(resolveTrustClass({ scope: 'read' })).toBe('read')
  })

  test('scope=write defaults to write trust class', () => {
    expect(resolveTrustClass({ scope: 'write' })).toBe('write')
  })

  test('scope=admin defaults to write trust class (does NOT auto-promote to destructive)', () => {
    expect(resolveTrustClass({ scope: 'admin' })).toBe('write')
  })
})

describe('requiresApproval', () => {
  function ctx(remote: boolean): OperationContext {
    return { remote, allowedScopes: new Set(['read', 'write', 'admin']) }
  }

  test('returns false for read-class ops on any ctx', () => {
    expect(requiresApproval(op({ scope: 'read' }), ctx(true))).toBe(false)
    expect(requiresApproval(op({ scope: 'read' }), ctx(false))).toBe(false)
  })

  test('returns true for write-class ops on a remote ctx', () => {
    expect(requiresApproval(op({ scope: 'write', mutating: true }), ctx(true))).toBe(true)
  })

  test('returns true for destructive ops on a remote ctx', () => {
    expect(requiresApproval(op({ scope: 'write', mutating: true, trustClass: 'destructive' }), ctx(true))).toBe(true)
  })

  test('returns false for write-class ops on a local ctx', () => {
    expect(requiresApproval(op({ scope: 'write', mutating: true }), ctx(false))).toBe(false)
  })

  test('returns false for destructive ops on a local ctx (local has cleared the boundary)', () => {
    expect(requiresApproval(op({ scope: 'write', mutating: true, trustClass: 'destructive' }), ctx(false))).toBe(false)
  })

  test('returns true when ctx.remote is missing/null/wrong-typed (fail closed)', () => {
    const writeOp = op({ scope: 'write', mutating: true })
    expect(requiresApproval(writeOp, {} as unknown as OperationContext)).toBe(true)
    expect(requiresApproval(writeOp, { remote: null as unknown as boolean })).toBe(true)
    expect(requiresApproval(writeOp, { remote: 'false' as unknown as boolean })).toBe(true)
  })
})

describe('validateActorCanApprove', () => {
  test('allows any approver for write trust class (no second-approver rule)', () => {
    const result = validateActorCanApprove({ id: 'alice' }, { trustClass: 'write', requestedBy: { id: 'alice' } })
    expect(result).toBeNull()
  })

  test('blocks self-approval for destructive trust class', () => {
    const result = validateActorCanApprove({ id: 'alice' }, { trustClass: 'destructive', requestedBy: { id: 'alice' } })
    expect(result).not.toBeNull()
    expect(result?.code).toBe('permission_denied')
    expect(result?.message).toContain('second approver')
    expect(result?.message).toContain('alice')
  })

  test('allows a different approver for destructive trust class', () => {
    const result = validateActorCanApprove({ id: 'bob' }, { trustClass: 'destructive', requestedBy: { id: 'alice' } })
    expect(result).toBeNull()
  })
})
