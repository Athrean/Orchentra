import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { OperationError, type Operation } from '@orchentra/operations'
import { buildShellAction } from '../src/op-commands/factory'

interface Sinks {
  stdout: string[]
  stderr: string[]
}

function sinks(): Sinks {
  const stdout: string[] = []
  const stderr: string[] = []
  return { stdout, stderr }
}

function fakeOp(handlerImpl: () => Promise<unknown>): Operation<{ x: string }, unknown> {
  return {
    id: 'fake_op_for_exit_code_test',
    description: 'fake op used to drive each error class through the factory',
    scope: 'read',
    localOnly: false,
    mutating: false,
    parameters: z.object({ x: z.string() }),
    handler: () => handlerImpl(),
  }
}

describe('exit code mapping', () => {
  test('exit 0 on success', async () => {
    const io = sinks()
    const op = fakeOp(async () => ({ ok: true }))
    const action = buildShellAction(op, {
      writeStdout: (l) => io.stdout.push(l),
      writeStderr: (l) => io.stderr.push(l),
    })
    expect(await action(['--x', 'a'])).toBe(0)
  })

  test('exit 1 on invalid_input (missing required flag)', async () => {
    const io = sinks()
    const op = fakeOp(async () => ({ ok: true }))
    const action = buildShellAction(op, {
      writeStdout: (l) => io.stdout.push(l),
      writeStderr: (l) => io.stderr.push(l),
    })
    expect(await action([])).toBe(1)
  })

  test('exit 2 on permission_denied', async () => {
    const io = sinks()
    const op = fakeOp(async () => {
      throw new OperationError({ code: 'permission_denied', message: 'no approval' })
    })
    const action = buildShellAction(op, {
      writeStdout: (l) => io.stdout.push(l),
      writeStderr: (l) => io.stderr.push(l),
    })
    expect(await action(['--x', 'a'])).toBe(2)
  })

  test('exit 3 on upstream_error', async () => {
    const io = sinks()
    const op = fakeOp(async () => {
      throw new OperationError({ code: 'upstream_error', message: 'GitHub 502' })
    })
    const action = buildShellAction(op, {
      writeStdout: (l) => io.stdout.push(l),
      writeStderr: (l) => io.stderr.push(l),
    })
    expect(await action(['--x', 'a'])).toBe(3)
  })

  test('exit 3 on not_found (treated as upstream-class)', async () => {
    const io = sinks()
    const op = fakeOp(async () => {
      throw new OperationError({ code: 'not_found', message: 'no such repo' })
    })
    const action = buildShellAction(op, {
      writeStdout: (l) => io.stdout.push(l),
      writeStderr: (l) => io.stderr.push(l),
    })
    expect(await action(['--x', 'a'])).toBe(3)
  })

  test('exit 4 on internal_error from a non-OperationError throw', async () => {
    const io = sinks()
    const op = fakeOp(async () => {
      throw new Error('boom')
    })
    const action = buildShellAction(op, {
      writeStdout: (l) => io.stdout.push(l),
      writeStderr: (l) => io.stderr.push(l),
    })
    expect(await action(['--x', 'a'])).toBe(4)
  })

  test('JSON envelope error.code aligns with the exit code', async () => {
    const io = sinks()
    const op = fakeOp(async () => {
      throw new OperationError({ code: 'permission_denied', message: 'no approval' })
    })
    const action = buildShellAction(op, {
      writeStdout: (l) => io.stdout.push(l),
      writeStderr: (l) => io.stderr.push(l),
    })
    const exit = await action(['--x', 'a', '--output-format', 'json'])
    expect(exit).toBe(2)
    const env = JSON.parse(io.stdout.join('\n')) as { error: { code: string } | null }
    expect(env.error?.code).toBe('permission_denied')
  })
})
