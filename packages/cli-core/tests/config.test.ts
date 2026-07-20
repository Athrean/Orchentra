import { test, expect, describe } from 'bun:test'
import { join } from 'node:path'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { ConfigLoader } from '../src/runtime/config'

const TMP = join(import.meta.dir, '__config_test_tmp__')

function setupTmp(structure: Record<string, string>): void {
  rmSync(TMP, { recursive: true, force: true })
  mkdirSync(TMP, { recursive: true })
  for (const [rel, content] of Object.entries(structure)) {
    const fullPath = join(TMP, rel)
    mkdirSync(join(fullPath, '..'), { recursive: true })
    writeFileSync(fullPath, content)
  }
}

function cleanup(): void {
  rmSync(TMP, { recursive: true, force: true })
}

describe('ConfigLoader', () => {
  test('discover returns correct precedence chain', () => {
    const loader = new ConfigLoader('/project', '/home/.orchentra')
    const entries = loader.discover()
    expect(entries).toHaveLength(5)
    expect(entries[0]).toEqual({ source: 'user', path: '/home/.orchentra.json' })
    expect(entries[1]).toEqual({ source: 'user', path: '/home/.orchentra/settings.json' })
    expect(entries[2]).toEqual({ source: 'project', path: '/project/.orchentra.json' })
    expect(entries[3]).toEqual({ source: 'project', path: '/project/.orchentra/settings.json' })
    expect(entries[4]).toEqual({ source: 'local', path: '/project/.orchentra/settings.local.json' })
  })

  test('load returns empty config when no files exist', () => {
    setupTmp({})
    const loader = new ConfigLoader(join(TMP, 'cwd'), join(TMP, 'home', '.orchentra'))
    const config = loader.load()
    expect(config.loadedEntries).toHaveLength(0)
    expect(config.featureConfig.model).toBeUndefined()
    expect(config.featureConfig.aliases).toEqual({})
    cleanup()
  })

  test('load reads user settings', () => {
    setupTmp({
      'home/.orchentra/settings.json': JSON.stringify({ model: 'claude-sonnet-4-20250514' }),
    })
    const loader = new ConfigLoader(join(TMP, 'cwd'), join(TMP, 'home', '.orchentra'))
    const config = loader.load()
    expect(config.featureConfig.model).toBe('claude-sonnet-4-20250514')
    cleanup()
  })

  test('budget defaults to no caps when unset', () => {
    setupTmp({})
    const loader = new ConfigLoader(join(TMP, 'cwd'), join(TMP, 'home', '.orchentra'))
    const config = loader.load()
    expect(config.featureConfig.budget).toEqual({ maxCostUsd: undefined, warnCostUsd: undefined })
    cleanup()
  })

  test('subagents caps default to undefined (built-in defaults apply) when unset', () => {
    setupTmp({})
    const loader = new ConfigLoader(join(TMP, 'cwd'), join(TMP, 'home', '.orchentra'))
    const config = loader.load()
    expect(config.featureConfig.subagents).toEqual({ maxDepth: undefined, maxConcurrent: undefined })
    cleanup()
  })

  test('reads positive integer subagents caps and ignores invalid values', () => {
    setupTmp({
      'home/.orchentra/settings.json': JSON.stringify({ subagents: { maxDepth: 3, maxConcurrent: 0 } }),
    })
    const loader = new ConfigLoader(join(TMP, 'cwd'), join(TMP, 'home', '.orchentra'))
    const config = loader.load()
    expect(config.featureConfig.subagents.maxDepth).toBe(3)
    // Non-positive is rejected, falling back to the built-in default.
    expect(config.featureConfig.subagents.maxConcurrent).toBeUndefined()
    cleanup()
  })

  test('configVersion defaults to the current version when unset', () => {
    setupTmp({})
    const loader = new ConfigLoader(join(TMP, 'cwd'), join(TMP, 'home', '.orchentra'))
    const config = loader.load()
    expect(config.configVersion).toBe(1)
    cleanup()
  })

  test('a settings file at the current version loads normally', () => {
    setupTmp({
      'home/.orchentra/settings.json': JSON.stringify({ version: 1, model: 'sonnet' }),
    })
    const loader = new ConfigLoader(join(TMP, 'cwd'), join(TMP, 'home', '.orchentra'))
    const config = loader.load()
    expect(config.configVersion).toBe(1)
    expect(config.featureConfig.model).toBe('sonnet')
    cleanup()
  })

  test('a settings file from a newer Orchentra fails loudly instead of loading', () => {
    setupTmp({
      'home/.orchentra/settings.json': JSON.stringify({ version: 99, model: 'sonnet' }),
    })
    const loader = new ConfigLoader(join(TMP, 'cwd'), join(TMP, 'home', '.orchentra'))
    expect(() => loader.load()).toThrow(/newer than this build/)
    cleanup()
  })

  test('terse mode defaults to off and reads valid settings', () => {
    setupTmp({})
    let loader = new ConfigLoader(join(TMP, 'cwd'), join(TMP, 'home', '.orchentra'))
    expect(loader.load().featureConfig.terseMode).toBe('off')

    setupTmp({
      'home/.orchentra/settings.json': JSON.stringify({ terseMode: 'full' }),
    })
    loader = new ConfigLoader(join(TMP, 'cwd'), join(TMP, 'home', '.orchentra'))
    expect(loader.load().featureConfig.terseMode).toBe('full')
    cleanup()
  })

  test('reads positive maxCostUsd / warnCostUsd and ignores non-positive values', () => {
    setupTmp({
      'home/.orchentra/settings.json': JSON.stringify({ budget: { maxCostUsd: 5, warnCostUsd: 0 } }),
    })
    const loader = new ConfigLoader(join(TMP, 'cwd'), join(TMP, 'home', '.orchentra'))
    const config = loader.load()
    expect(config.featureConfig.budget.maxCostUsd).toBe(5)
    expect(config.featureConfig.budget.warnCostUsd).toBeUndefined()
    cleanup()
  })

  test('load deep-merges user and project settings', () => {
    setupTmp({
      'home/.orchentra/settings.json': JSON.stringify({ model: 'sonnet', aliases: { s: 'sonnet' } }),
      'cwd/.orchentra/settings.json': JSON.stringify({ aliases: { h: 'haiku' }, permissionMode: 'read-only' }),
    })
    const loader = new ConfigLoader(join(TMP, 'cwd'), join(TMP, 'home', '.orchentra'))
    const config = loader.load()
    expect(config.featureConfig.model).toBe('sonnet')
    expect(config.featureConfig.aliases).toEqual({ s: 'sonnet', h: 'haiku' })
    expect(config.featureConfig.permissionMode).toBe('read-only')
    cleanup()
  })

  test('local settings override project settings', () => {
    setupTmp({
      'cwd/.orchentra/settings.json': JSON.stringify({ model: 'sonnet' }),
      'cwd/.orchentra/settings.local.json': JSON.stringify({ model: 'opus' }),
    })
    const loader = new ConfigLoader(join(TMP, 'cwd'), join(TMP, 'home', '.orchentra'))
    const config = loader.load()
    expect(config.featureConfig.model).toBe('opus')
    cleanup()
  })

  test('extracts hooks config', () => {
    setupTmp({
      'home/.orchentra/settings.json': JSON.stringify({
        hooks: {
          PreToolUse: ['echo pre'],
          PostToolUse: ['echo post'],
          PostToolUseFailure: ['echo fail'],
        },
      }),
    })
    const loader = new ConfigLoader(join(TMP, 'cwd'), join(TMP, 'home', '.orchentra'))
    const config = loader.load()
    expect(config.featureConfig.hooks.preToolUse).toEqual(['echo pre'])
    expect(config.featureConfig.hooks.postToolUse).toEqual(['echo post'])
    expect(config.featureConfig.hooks.postToolUseFailure).toEqual(['echo fail'])
    cleanup()
  })

  test('extracts permission rules', () => {
    setupTmp({
      'home/.orchentra/settings.json': JSON.stringify({
        permissions: {
          allow: ['Bash(git log*)'],
          deny: ['Bash(rm -rf*)'],
          ask: ['Bash(npm*)'],
        },
      }),
    })
    const loader = new ConfigLoader(join(TMP, 'cwd'), join(TMP, 'home', '.orchentra'))
    const config = loader.load()
    expect(config.featureConfig.permissionRules.allow).toEqual(['Bash(git log*)'])
    expect(config.featureConfig.permissionRules.deny).toEqual(['Bash(rm -rf*)'])
    expect(config.featureConfig.permissionRules.ask).toEqual(['Bash(npm*)'])
    cleanup()
  })

  test('ignores invalid permission mode', () => {
    setupTmp({
      'home/.orchentra/settings.json': JSON.stringify({ permissionMode: 'invalid-mode' }),
    })
    const loader = new ConfigLoader(join(TMP, 'cwd'), join(TMP, 'home', '.orchentra'))
    const config = loader.load()
    expect(config.featureConfig.permissionMode).toBeUndefined()
    cleanup()
  })

  test('ignores empty JSON files', () => {
    setupTmp({
      'home/.orchentra/settings.json': '',
    })
    const loader = new ConfigLoader(join(TMP, 'cwd'), join(TMP, 'home', '.orchentra'))
    const config = loader.load()
    expect(config.loadedEntries).toHaveLength(1)
    expect(config.featureConfig.model).toBeUndefined()
    cleanup()
  })

  test('tracks loaded entries', () => {
    setupTmp({
      'home/.orchentra/settings.json': JSON.stringify({ model: 'sonnet' }),
      'cwd/.orchentra/settings.json': JSON.stringify({}),
    })
    const loader = new ConfigLoader(join(TMP, 'cwd'), join(TMP, 'home', '.orchentra'))
    const config = loader.load()
    expect(config.loadedEntries).toHaveLength(2)
    expect(config.loadedEntries[0].source).toBe('user')
    expect(config.loadedEntries[1].source).toBe('project')
    cleanup()
  })
})
