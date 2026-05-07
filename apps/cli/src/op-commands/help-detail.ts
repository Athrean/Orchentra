import type { Operation } from '@orchentra/operations'
import { z } from 'zod'

interface ParamRow {
  name: string
  type: string
  required: boolean
  description: string
}

/**
 * Render an op's parameters as a help block: name, type, required vs
 * optional, description (from Zod .describe()). Used by `/help <op_id>`.
 */
export function renderOpDetail(op: Operation<unknown, unknown>): string {
  const rows = extractParamRows(op.parameters)
  const w = Math.max(0, ...rows.map((r) => r.name.length))
  const lines: string[] = []
  lines.push(`/${op.id}`)
  if (op.description) lines.push(`  ${op.description}`)
  lines.push('')
  lines.push('  Parameters:')
  for (const r of rows) {
    const tag = r.required ? '(required)' : '(optional)'
    lines.push(`    ${r.name.padEnd(w)}  ${r.type.padEnd(8)}  ${tag}  ${r.description}`)
  }
  return lines.join('\n')
}

function extractParamRows(schema: unknown): ParamRow[] {
  const shape = (schema as { shape?: Record<string, unknown> }).shape
  if (!shape) return []
  const rows: ParamRow[] = []
  for (const [name, field] of Object.entries(shape)) {
    rows.push({
      name,
      type: typeName(field),
      required: !isOptional(field),
      description: descriptionOf(field) ?? '',
    })
  }
  return rows
}

function isOptional(field: unknown): boolean {
  return field instanceof z.ZodOptional || field instanceof z.ZodNullable || field instanceof z.ZodDefault
}

function unwrap(field: unknown): unknown {
  let f = field
  for (let i = 0; i < 16; i++) {
    if (f instanceof z.ZodOptional || f instanceof z.ZodNullable || f instanceof z.ZodDefault) {
      f = (f as unknown as { _def: { innerType: unknown } })._def.innerType
      continue
    }
    return f
  }
  return f
}

function typeName(field: unknown): string {
  const inner = unwrap(field)
  if (inner instanceof z.ZodString) return 'string'
  if (inner instanceof z.ZodNumber) return 'number'
  if (inner instanceof z.ZodBoolean) return 'boolean'
  if (inner instanceof z.ZodEnum) return 'enum'
  if (inner instanceof z.ZodArray) return 'array'
  if (inner instanceof z.ZodObject) return 'object'
  return 'any'
}

function descriptionOf(field: unknown): string | undefined {
  const desc = (field as { _def?: { description?: string } })._def?.description
  if (desc) return desc
  const innerDesc = (unwrap(field) as { _def?: { description?: string } })._def?.description
  return innerDesc
}
