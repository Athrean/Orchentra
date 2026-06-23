import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = join(import.meta.dir, '..', '..', '..')
const MAIN = join(REPO_ROOT, 'apps', 'cli', 'src', 'main.ts')

/**
 * The lazy-import contract: light verbs (`--version`, `--help`) must not pay
 * the parse cost of the REPL, Ink/React, doctor, MCP, or op-verb dispatcher.
 *
 * The cheapest way to enforce this is source-level: verify that the heavy
 * modules are imported via `await import(...)` inside their `case` branch,
 * not via top-level `import` statements. End-to-end timing is asserted
 * separately so a real regression (someone re-adding a top-level import)
 * still surfaces.
 */

const HEAVY_MODULES = [
  './repl',
  './commands/session-replay',
  './commands/doctor',
  './commands/mcp',
  './commands/run-auth',
  './commands/run-reauth',
  './commands/run-init',
]

describe('lazy verb imports — source contract', () => {
  const source = readFileSync(MAIN, 'utf-8')

  for (const mod of HEAVY_MODULES) {
    test(`${mod} is not imported at top level`, () => {
      const topLevelImport = new RegExp(`^\\s*import .* from '${mod}'`, 'm')
      expect(source).not.toMatch(topLevelImport)
    })

    test(`${mod} is imported via await import()`, () => {
      const dynamicImport = `await import('${mod}')`
      expect(source).toContain(dynamicImport)
    })
  }

  test('only the args module is imported at top level (apart from version + types)', () => {
    // Static imports allowed: version (sync constants) and args (parseArgs +
    // renderHelp called before any case branch). Everything else must be
    // dynamic so cold-start for `--version`/`--help` is fast.
    const topLevelLines = source.split('\n').filter((line) => line.startsWith('import '))
    const fromPaths = topLevelLines.map((line) => {
      const match = /from '([^']+)'/.exec(line)
      return match ? match[1] : ''
    })
    expect(fromPaths.sort()).toEqual(['./args', './version'])
  })
})

describe('lazy verb imports — runtime smoke', () => {
  test('--version returns 0 and prints the version', () => {
    const result = spawnSync('bun', [MAIN, '--version'], { encoding: 'utf-8' })
    expect(result.status).toBe(0)
    expect(result.stdout).toMatch(/^orchentra \S+\n$/)
  })

  test('--help returns 0 and prints USAGE', () => {
    const result = spawnSync('bun', [MAIN, '--help'], { encoding: 'utf-8' })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('USAGE')
  })
})
