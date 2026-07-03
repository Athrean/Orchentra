import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import type { SessionControl, UsageTotals } from '@orchentra/cli-core'
import { LeanCommand } from '../src/commands/builtin/lean'
import { createBuiltinRegistry } from '../src/commands/builtin'
import type { CommandContext } from '../src/commands/registry'
import type { UiOutput } from '../src/commands/ui-output'

function runGit(cwd: string, args: string[]): void {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith('GIT_')) env[key] = value
  }
  const result = Bun.spawnSync(['git', ...args], { cwd, env, stdout: 'pipe', stderr: 'pipe' })
  if (!result.success) throw new Error(`git ${args.join(' ')} failed`)
}

function session(): SessionControl {
  const usage: UsageTotals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }
  return {
    getModel: () => 'm',
    setModel: () => 'm',
    getPermissionMode: () => 'workspace-write',
    setPermissionMode: (m) => m,
    getSessionId: () => 's',
    getTurns: () => 0,
    getUsage: () => usage,
    clearHistory: () => {},
    forceCompact: () => {},
  }
}

function makeCtx(cwd: string): { ctx: CommandContext; events: UiOutput[] } {
  const events: UiOutput[] = []
  return { events, ctx: { cwd, session: session(), ui: (event) => events.push(event) } }
}

describe('LeanCommand', () => {
  test('is registered as a workspace slash command', () => {
    const registry = createBuiltinRegistry()
    expect(registry.resolve('/lean')).not.toBeInstanceOf(Error)
    expect(registry.allSpecs().map((s) => s.name)).toContain('lean')
  })

  test('reports diff shape and lean risk markers', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'orchentra-lean-'))
    runGit(cwd, ['init'])
    runGit(cwd, ['config', 'user.email', 'test@example.com'])
    runGit(cwd, ['config', 'user.name', 'Test'])
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ dependencies: {} }, null, 2) + '\n')
    writeFileSync(join(cwd, 'src.ts'), 'export const value = 1\n')
    runGit(cwd, ['add', 'package.json', 'src.ts'])
    runGit(cwd, ['commit', '-m', 'init'])
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ dependencies: { leftpad: '1.0.0' } }, null, 2) + '\n')
    writeFileSync(join(cwd, 'src.ts'), 'const value: any = 1\nconsole.log(value)\n')
    const { ctx, events } = makeCtx(cwd)

    await new LeanCommand().execute([], ctx)

    const card = events[0]
    if (card.kind !== 'card') throw new Error('expected card')
    const text = JSON.stringify(card)
    expect(text).toContain('New dependencies')
    expect(text).toContain('leftpad')
    expect(text).toContain('type escapes')
  })

  test('--fix delegates a lean simplification turn', async () => {
    const { ctx, events } = makeCtx('/work')
    let prompt = ''
    ctx.runTurn = async (input) => {
      prompt = input
    }

    await new LeanCommand().execute(['--fix', '--path', 'src/a.ts'], ctx)

    expect(prompt).toContain('Run a lean-code pass')
    expect(prompt).toContain('Path scope: src/a.ts')
    expect(events).toEqual([{ kind: 'note', text: 'Lean simplification turn started.', tone: 'info' }])
  })
})
