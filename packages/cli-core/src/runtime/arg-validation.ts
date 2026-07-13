/**
 * Minimal JSON Schema subset validator for tool arguments, run once at the
 * registry choke point so a malformed call fails with one typed error instead
 * of wherever each tool happens to read its input. Covers what our tool
 * schemas actually use — object shape, required, primitive property types,
 * enum, minimum, array item types, additionalProperties: false. Anything the
 * subset doesn't understand is permissive: unknown constructs never reject.
 */

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'array':
      return Array.isArray(value)
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value)
    case 'null':
      return value === null
    default:
      return true
  }
}

function typeLabel(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function checkTypeKeyword(value: unknown, declared: unknown, path: string, errors: string[]): void {
  if (typeof declared === 'string') {
    if (!matchesType(value, declared)) {
      errors.push(`${path}: expected ${declared}, got ${typeLabel(value)}`)
    }
    return
  }
  if (Array.isArray(declared) && declared.every((t) => typeof t === 'string')) {
    if (!declared.some((t) => matchesType(value, t))) {
      errors.push(`${path}: expected ${declared.join('|')}, got ${typeLabel(value)}`)
    }
  }
}

function checkProperty(value: unknown, propSchema: Record<string, unknown>, path: string, errors: string[]): void {
  const before = errors.length
  checkTypeKeyword(value, propSchema.type, path, errors)
  if (errors.length > before) return

  if (Array.isArray(propSchema.enum) && !propSchema.enum.includes(value)) {
    errors.push(`${path}: must be one of ${propSchema.enum.map((v) => JSON.stringify(v)).join(', ')}`)
    return
  }

  if (typeof propSchema.minimum === 'number' && typeof value === 'number' && value < propSchema.minimum) {
    errors.push(`${path}: must be >= ${propSchema.minimum}`)
  }

  const items = propSchema.items
  if (Array.isArray(value) && typeof items === 'object' && items !== null && !Array.isArray(items)) {
    const itemType = (items as Record<string, unknown>).type
    value.forEach((element, index) => {
      checkTypeKeyword(element, itemType, `${path}[${index}]`, errors)
    })
  }
}

/**
 * Validate `args` against a tool's input schema. Returns human-readable
 * problems, empty when valid. `undefined`/`null` args count as `{}` (tools
 * with no required fields accept an omitted input object).
 */
export function validateToolArgs(schema: Record<string, unknown>, args: unknown): string[] {
  if (schema.type !== 'object') return []

  const errors: string[] = []
  const value = args ?? {}
  if (typeof value !== 'object' || Array.isArray(value)) {
    return [`arguments must be an object, got ${typeLabel(value)}`]
  }
  const record = value as Record<string, unknown>

  if (Array.isArray(schema.required)) {
    for (const key of schema.required) {
      if (typeof key === 'string' && record[key] === undefined) {
        errors.push(`missing required field '${key}'`)
      }
    }
  }

  const properties =
    typeof schema.properties === 'object' && schema.properties !== null && !Array.isArray(schema.properties)
      ? (schema.properties as Record<string, unknown>)
      : undefined

  if (properties) {
    for (const key of Object.keys(record)) {
      const propSchema = properties[key]
      if (propSchema === undefined) {
        if (schema.additionalProperties === false) {
          errors.push(`unknown field '${key}'`)
        }
        continue
      }
      if (record[key] === undefined) continue
      if (typeof propSchema === 'object' && propSchema !== null && !Array.isArray(propSchema)) {
        checkProperty(record[key], propSchema as Record<string, unknown>, key, errors)
      }
    }
  }

  return errors
}
