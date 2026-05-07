import {
  dispatch,
  OperationError,
  type Operation,
  type OperationContext,
  type OperationScope,
} from '@orchentra/operations'
import { randomUUID } from 'node:crypto'
import { parseShellArgv, parseSlashArgs, type ParseResult } from './argv'

export interface IoSinks {
  writeStdout: (line: string) => void
  writeStderr: (line: string) => void
}

export type OutputFormat = 'text' | 'json' | 'tree'

export interface JsonEnvelope {
  executionId: string
  nodeIds: string[]
  result: unknown
  error: { code: string; message: string; suggestion?: string } | null
  durationMs: number
}

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set<OperationScope>(['read', 'write', 'admin']),
}

export function buildShellAction<T, R>(op: Operation<T, R>, io: IoSinks): (argv: string[]) => Promise<number> {
  return async (argv) => {
    const { format, rest } = extractOutputFormat(argv)
    return runWithParse(op, parseShellArgv(op, rest), io, format)
  }
}

export function buildSlashHandlerArgs<T, R>(op: Operation<T, R>, io: IoSinks): (args: string[]) => Promise<number> {
  return async (args) => {
    const { format, rest } = extractOutputFormat(args)
    return runWithParse(op, parseSlashArgs(op, rest), io, format)
  }
}

/**
 * Strip `--output-format <fmt>` (and `--output-format=<fmt>`) out of argv
 * before handing the rest to the per-op argv parser. Default is `text`.
 */
function extractOutputFormat(argv: string[]): { format: OutputFormat; rest: string[] } {
  const rest: string[] = []
  let format: OutputFormat = 'text'
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]
    if (tok === '--output-format' || tok === '-o') {
      format = normalizeFormat(argv[i + 1])
      i++
      continue
    }
    if (tok.startsWith('--output-format=')) {
      format = normalizeFormat(tok.slice('--output-format='.length))
      continue
    }
    rest.push(tok)
  }
  return { format, rest }
}

function normalizeFormat(raw: string | undefined): OutputFormat {
  if (raw === 'json') return 'json'
  if (raw === 'tree') return 'tree'
  return 'text'
}

async function runWithParse<T, R>(
  op: Operation<T, R>,
  parsed: ParseResult<T>,
  io: IoSinks,
  format: OutputFormat,
): Promise<number> {
  const executionId = randomUUID()
  const startedAt = Date.now()

  if (!parsed.ok) {
    const err = { code: 'invalid_input', message: parsed.error }
    emit(io, format, executionId, [], null, err, Date.now() - startedAt)
    return 1
  }

  try {
    const result = await dispatch(op, localCtx, parsed.value)
    emit(io, format, executionId, [], result, null, Date.now() - startedAt)
    return 0
  } catch (err) {
    if (err instanceof OperationError) {
      const payload = {
        code: err.code,
        message: err.message,
        ...(err.suggestion ? { suggestion: err.suggestion } : {}),
      }
      emit(io, format, executionId, [], null, payload, Date.now() - startedAt)
      return exitCodeFor(err.code)
    }
    const payload = { code: 'internal_error', message: err instanceof Error ? err.message : String(err) }
    emit(io, format, executionId, [], null, payload, Date.now() - startedAt)
    return 4
  }
}

/**
 * Exit code map for OperationError codes. Stable contract — scripts and CI
 * gates depend on this. New codes default to 3 (upstream-class) so adding
 * one does not silently flip an existing caller's behavior.
 */
function exitCodeFor(code: string): number {
  switch (code) {
    case 'invalid_input':
      return 1
    case 'permission_denied':
    case 'awaiting_approval':
      return 2
    case 'not_found':
    case 'upstream_error':
      return 3
    case 'internal_error':
      return 4
    default:
      return 3
  }
}

function emit(
  io: IoSinks,
  format: OutputFormat,
  executionId: string,
  nodeIds: string[],
  result: unknown,
  error: JsonEnvelope['error'],
  durationMs: number,
): void {
  if (format === 'json') {
    const envelope: JsonEnvelope = { executionId, nodeIds, result, error, durationMs }
    io.writeStdout(JSON.stringify(envelope, null, 2))
    return
  }
  if (error) {
    io.writeStderr(`✗ ${error.code}: ${error.message}`)
    return
  }
  io.writeStdout(renderResult(result))
}

function renderResult(result: unknown): string {
  if (result === null || result === undefined) return ''
  if (typeof result === 'string') return result
  return JSON.stringify(result, null, 2)
}
