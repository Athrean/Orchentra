import type { Operation } from '@orchentra/operations'
import { z } from 'zod'

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

export function parseShellArgv<T>(op: Operation<T, unknown>, argv: string[]): ParseResult<T> {
  const raw: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]
    if (!tok.startsWith('--')) {
      return { ok: false, error: `unexpected positional arg: ${tok}` }
    }
    const key = tok.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      return { ok: false, error: `flag --${key} requires a value` }
    }
    raw[key] = next
    i++
  }
  return finalizeParse(op, raw, '--')
}

export function parseSlashArgs<T>(op: Operation<T, unknown>, args: string[]): ParseResult<T> {
  const raw: Record<string, string> = {}
  for (const tok of args) {
    const eq = tok.indexOf('=')
    if (eq <= 0) {
      return { ok: false, error: `expected key=value, got: ${tok}` }
    }
    raw[tok.slice(0, eq)] = tok.slice(eq + 1)
  }
  return finalizeParse(op, raw, '')
}

function finalizeParse<T>(op: Operation<T, unknown>, raw: Record<string, string>, flagPrefix: string): ParseResult<T> {
  const shape = (op.parameters as unknown as { shape?: Record<string, z.ZodType<unknown>> }).shape
  if (shape) {
    for (const key of Object.keys(raw)) {
      if (!(key in shape)) {
        const known = Object.keys(shape).join(', ')
        return { ok: false, error: `unknown ${flagPrefix ? 'flag' : 'key'} ${flagPrefix}${key}. valid: ${known}` }
      }
    }
  }
  const coerced = coerceForSchema(op.parameters, raw)
  const parsed = op.parameters.safeParse(coerced)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.toString() }
  }
  return { ok: true, value: parsed.data }
}

function coerceForSchema(schema: z.ZodType<unknown>, raw: Record<string, string>): Record<string, unknown> {
  const shape = (schema as unknown as { shape?: Record<string, z.ZodType<unknown>> }).shape
  if (!shape) return raw
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(raw)) {
    const fieldSchema = shape[key]
    out[key] = fieldSchema ? coerceValue(fieldSchema, val) : val
  }
  return out
}

function coerceValue(schema: z.ZodType<unknown>, val: string): unknown {
  const innermost = unwrap(schema)
  if (innermost instanceof z.ZodNumber) {
    const n = Number(val)
    return Number.isFinite(n) ? n : val
  }
  if (innermost instanceof z.ZodBoolean) {
    if (val === 'true') return true
    if (val === 'false') return false
    return val
  }
  return val
}

function unwrap(schema: z.ZodType<unknown>): z.ZodType<unknown> {
  let s: z.ZodType<unknown> = schema
  for (let i = 0; i < 16; i++) {
    if (s instanceof z.ZodOptional || s instanceof z.ZodNullable || s instanceof z.ZodDefault) {
      s = (s as unknown as { _def: { innerType: z.ZodType<unknown> } })._def.innerType
      continue
    }
    return s
  }
  return s
}
