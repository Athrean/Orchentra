import { describe, expect, test } from 'bun:test'
import type { Operation } from '@orchentra/operations'
import { createCliApprovalCallback } from '../src/approval-prompt'

// Stub Operation shapes — the prompt only reads `id`, `scope`, `trustClass`.
// The Zod schema is irrelevant here since we pass parsed data through.
function writeOp(): Operation<{ body: string }, { posted: boolean }> {
  return {
    id: 'post_comment',
    description: '',
    scope: 'write',
    localOnly: false,
    mutating: true,
    parameters: { safeParse: () => ({ success: true, data: {} }) } as unknown as Operation['parameters'],
    handler: async () => ({ posted: true }),
  }
}

function destructiveOp(): Operation<{ branch: string }, { ok: true }> {
  return {
    id: 'force_push',
    description: '',
    scope: 'write',
    trustClass: 'destructive',
    localOnly: false,
    mutating: true,
    parameters: { safeParse: () => ({ success: true, data: {} }) } as unknown as Operation['parameters'],
    handler: async () => ({ ok: true }),
  }
}

describe('createCliApprovalCallback', () => {
  test('non-TTY stdin auto-denies and never reads input', async () => {
    let read = false
    const notices: string[] = []
    const cb = createCliApprovalCallback({
      isTty: () => false,
      writePrompt: () => {},
      writeNotice: (t) => notices.push(t),
      readLineRaw: async () => {
        read = true
        return null
      },
    })
    const result = await cb(writeOp(), { body: 'hi' })
    expect(result).toEqual({ status: 'denied', reason: 'no TTY available to prompt for approval' })
    expect(read).toBe(false)
    expect(notices[0]).toMatch(/no TTY/i)
  })

  test('TTY stdin returning "y" approves the op', async () => {
    const cb = createCliApprovalCallback({
      isTty: () => true,
      writePrompt: () => {},
      writeNotice: () => {},
      readLineRaw: async () => 'y',
    })
    const result = await cb(writeOp(), { body: 'hi' })
    expect(result).toEqual({ status: 'approved' })
  })

  test('TTY stdin returning "yes" approves the op', async () => {
    const cb = createCliApprovalCallback({
      isTty: () => true,
      writePrompt: () => {},
      writeNotice: () => {},
      readLineRaw: async () => 'YES',
    })
    const result = await cb(writeOp(), { body: 'hi' })
    expect((result as { status: string }).status).toBe('approved')
  })

  test('TTY stdin returning anything else denies the op', async () => {
    const cb = createCliApprovalCallback({
      isTty: () => true,
      writePrompt: () => {},
      writeNotice: () => {},
      readLineRaw: async () => 'n',
    })
    const result = await cb(writeOp(), { body: 'hi' })
    expect((result as { status: string }).status).toBe('denied')
  })

  test('null from readLineRaw (timeout / EOF) denies with timeout reason', async () => {
    const cb = createCliApprovalCallback({
      isTty: () => true,
      writePrompt: () => {},
      writeNotice: () => {},
      readLineRaw: async () => null,
    })
    const result = await cb(writeOp(), { body: 'hi' })
    expect((result as { status: string }).status).toBe('denied')
    expect((result as { reason?: string }).reason).toContain('timed out')
  })

  test('prompt banner mentions DESTRUCTIVE for destructive trust class', async () => {
    const prompts: string[] = []
    const cb = createCliApprovalCallback({
      isTty: () => true,
      writePrompt: (t) => prompts.push(t),
      writeNotice: () => {},
      readLineRaw: async () => 'y',
    })
    await cb(destructiveOp(), { branch: 'main' })
    expect(prompts.length).toBe(1)
    expect(prompts[0]).toContain('DESTRUCTIVE')
    expect(prompts[0]).toContain('force_push')
    expect(prompts[0]).toContain('main')
  })

  test('prompt banner mentions WRITE for write trust class', async () => {
    const prompts: string[] = []
    const cb = createCliApprovalCallback({
      isTty: () => true,
      writePrompt: (t) => prompts.push(t),
      writeNotice: () => {},
      readLineRaw: async () => 'n',
    })
    await cb(writeOp(), { body: 'hi' })
    expect(prompts[0]).toContain('[WRITE]')
    expect(prompts[0]).toContain('post_comment')
  })

  test('passes timeoutMs through to readLineRaw', async () => {
    let received = -1
    const cb = createCliApprovalCallback({
      isTty: () => true,
      writePrompt: () => {},
      writeNotice: () => {},
      readLineRaw: async (ms) => {
        received = ms
        return 'y'
      },
      timeoutMs: 12345,
    })
    await cb(writeOp(), { body: 'hi' })
    expect(received).toBe(12345)
  })
})
