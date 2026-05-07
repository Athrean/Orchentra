import {
  dispatch,
  OperationError,
  type Operation,
  type OperationContext,
  type OperationScope,
} from '@orchentra/operations'
import { parseShellArgv, parseSlashArgs, type ParseResult } from './argv'

export interface IoSinks {
  writeStdout: (line: string) => void
  writeStderr: (line: string) => void
}

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set<OperationScope>(['read', 'write', 'admin']),
}

export function buildShellAction<T, R>(op: Operation<T, R>, io: IoSinks): (argv: string[]) => Promise<number> {
  return (argv) => runWithParse(op, parseShellArgv(op, argv), io)
}

export function buildSlashHandlerArgs<T, R>(op: Operation<T, R>, io: IoSinks): (args: string[]) => Promise<number> {
  return (args) => runWithParse(op, parseSlashArgs(op, args), io)
}

async function runWithParse<T, R>(op: Operation<T, R>, parsed: ParseResult<T>, io: IoSinks): Promise<number> {
  if (!parsed.ok) {
    io.writeStderr(`✗ invalid_input: ${parsed.error}`)
    return 1
  }
  try {
    const result = await dispatch(op, localCtx, parsed.value)
    io.writeStdout(renderResult(result))
    return 0
  } catch (err) {
    if (err instanceof OperationError) {
      io.writeStderr(`✗ ${err.code}: ${err.message}`)
      return err.code === 'invalid_input' ? 1 : err.code === 'permission_denied' ? 2 : 3
    }
    io.writeStderr(`✗ internal_error: ${err instanceof Error ? err.message : String(err)}`)
    return 4
  }
}

function renderResult(result: unknown): string {
  if (result === null || result === undefined) return ''
  if (typeof result === 'string') return result
  return JSON.stringify(result, null, 2)
}
