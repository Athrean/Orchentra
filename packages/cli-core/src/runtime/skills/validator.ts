export interface ValidatedSkillFrontmatter {
  name: string
  description: string
  allowedTools: string[]
  argumentNames: string[]
  disableModelInvocation: boolean
}

export type ValidateSkillResult =
  | { kind: 'ok'; value: ValidatedSkillFrontmatter }
  | { kind: 'error'; field: string; message: string }

export function validateSkillFrontmatter(meta: Record<string, unknown>): ValidateSkillResult {
  const name = requireString(meta, 'name')
  if (name.kind === 'error') return name
  const description = requireString(meta, 'description')
  if (description.kind === 'error') return description

  const allowedTools = optionalStringArray(meta, 'allowed-tools')
  if (allowedTools.kind === 'error') return allowedTools
  const argumentNames = optionalStringArray(meta, 'arguments')
  if (argumentNames.kind === 'error') return argumentNames
  const disableModelInvocation = optionalBoolean(meta, 'disable-model-invocation')
  if (disableModelInvocation.kind === 'error') return disableModelInvocation

  return {
    kind: 'ok',
    value: {
      name: name.value,
      description: description.value,
      allowedTools: allowedTools.value,
      argumentNames: argumentNames.value,
      disableModelInvocation: disableModelInvocation.value,
    },
  }
}

interface FieldOk<T> { kind: 'ok'; value: T }
interface FieldErr { kind: 'error'; field: string; message: string }
type FieldResult<T> = FieldOk<T> | FieldErr

function requireString(meta: Record<string, unknown>, field: string): FieldResult<string> {
  const value = meta[field]
  if (value === undefined || value === null || value === '') {
    return { kind: 'error', field, message: `'${field}' is required` }
  }
  if (typeof value !== 'string') {
    return { kind: 'error', field, message: `'${field}' must be a string` }
  }
  return { kind: 'ok', value }
}

function optionalStringArray(meta: Record<string, unknown>, field: string): FieldResult<string[]> {
  const value = meta[field]
  if (value === undefined) return { kind: 'ok', value: [] }
  if (!Array.isArray(value)) {
    return { kind: 'error', field, message: `'${field}' must be an array of strings` }
  }
  for (const item of value) {
    if (typeof item !== 'string') {
      return { kind: 'error', field, message: `'${field}' must contain only strings` }
    }
  }
  return { kind: 'ok', value: value as string[] }
}

function optionalBoolean(meta: Record<string, unknown>, field: string): FieldResult<boolean> {
  const value = meta[field]
  if (value === undefined) return { kind: 'ok', value: false }
  if (typeof value === 'string') {
    if (value === 'true') return { kind: 'ok', value: true }
    if (value === 'false') return { kind: 'ok', value: false }
  }
  if (typeof value !== 'boolean') {
    return { kind: 'error', field, message: `'${field}' must be a boolean` }
  }
  return { kind: 'ok', value }
}
