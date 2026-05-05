import type { Runbook, Skill } from './types'

/**
 * YAML-safe quoting for scalar strings inside frontmatter. We only quote when
 * we have to — colons, leading dashes, hashes, and quote characters all need
 * escaping. Everything else is emitted as a plain scalar to keep the file
 * human-friendly.
 */
function yamlScalar(value: string): string {
  const needsQuoting =
    value.includes(':') ||
    value.includes('#') ||
    value.startsWith('-') ||
    value.startsWith('?') ||
    value.startsWith('!') ||
    value.startsWith('&') ||
    value.startsWith('*') ||
    value.startsWith('"') ||
    value.startsWith("'") ||
    value.includes('\n')
  if (!needsQuoting) return value
  // Use double quotes; escape the few characters JSON-style strings allow.
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
  return `"${escaped}"`
}

function yamlList(field: string, items: string[]): string {
  if (items.length === 0) return `${field}: []`
  const lines = items.map((item) => `  - ${yamlScalar(item)}`)
  return [`${field}:`, ...lines].join('\n')
}

/**
 * Render a runbook (or its export-shaped Skill view) as a SKILL.md document.
 * Pure function: same input → byte-identical output. The exporter never
 * stamps a timestamp or generator note, which is what lets fixture-based
 * tests assert exact bytes.
 *
 * Format:
 *   ---
 *   name: <slug>
 *   description: <one-line>
 *   triggers:
 *     - <string>
 *   ops_used:
 *     - <op id>
 *   ---
 *
 *   <body — passed through verbatim with a trailing newline guaranteed>
 */
export function exportSkillMd(input: Runbook | Skill): string {
  const frontmatter = [
    '---',
    `name: ${yamlScalar(input.name)}`,
    `description: ${yamlScalar(input.description)}`,
    yamlList('triggers', input.triggers),
    yamlList('ops_used', input.opsUsed),
    '---',
  ].join('\n')

  const body = input.body.endsWith('\n') ? input.body : `${input.body}\n`
  return `${frontmatter}\n\n${body}`
}

/**
 * Convenience converter for callers that want the export-shaped Skill view
 * directly rather than the full Runbook row.
 */
export function runbookToSkill(runbook: Runbook): Skill {
  return {
    name: runbook.name,
    description: runbook.description,
    triggers: runbook.triggers,
    opsUsed: runbook.opsUsed,
    body: runbook.body,
  }
}
