import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ThemeCommand } from '../../src/commands/builtin/theme'
import type { CommandContext } from '../../src/commands/registry'
import type { UiOutput } from '../../src/commands/ui-output'
import { loadActiveTheme } from '../../src/tui/theme-registry'

function fakeCtx(): { ctx: CommandContext; emitted: UiOutput[]; printed: string[] } {
  const emitted: UiOutput[] = []
  const printed: string[] = []
  // Slash handler talks to stdout when no TUI sink is present; capture both
  // surfaces so a single test can assert either path.
  const orig = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    printed.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'))
    return true
  }) as typeof process.stdout.write
  const ctx: CommandContext = {
    cwd: '/tmp',
    session: {} as CommandContext['session'],
    ui: (output) => emitted.push(output),
  }
  // restore stdout in teardown via captured `orig` — return a finalizer
  ;(ctx as unknown as { __restoreStdout: () => void }).__restoreStdout = () => {
    process.stdout.write = orig
  }
  return { ctx, emitted, printed }
}

describe('/theme slash handler', () => {
  let tempHome: string
  let prevHome: string | undefined
  beforeEach(() => {
    prevHome = process.env['ORCHENTRA_CONFIG_HOME']
    tempHome = mkdtempSync(join(tmpdir(), 'orchentra-theme-slash-test-'))
    process.env['ORCHENTRA_CONFIG_HOME'] = tempHome
  })
  afterEach(() => {
    if (prevHome === undefined) delete process.env['ORCHENTRA_CONFIG_HOME']
    else process.env['ORCHENTRA_CONFIG_HOME'] = prevHome
    rmSync(tempHome, { recursive: true, force: true })
  })

  test('zero args in TUI emits theme-picker', async () => {
    const cmd = new ThemeCommand()
    const { ctx, emitted } = fakeCtx()
    try {
      await cmd.execute([], ctx)
      expect(emitted.length).toBe(1)
      expect(emitted[0]?.kind).toBe('theme-picker')
    } finally {
      ;(ctx as unknown as { __restoreStdout: () => void }).__restoreStdout()
    }
  })

  test('/theme <name> sets the active theme and emits a note', async () => {
    const cmd = new ThemeCommand()
    const { ctx, emitted } = fakeCtx()
    try {
      await cmd.execute(['light'], ctx)
      expect(loadActiveTheme()).toBe('light')
      const note = emitted.find((e) => e.kind === 'note')
      expect(note).toBeDefined()
    } finally {
      ;(ctx as unknown as { __restoreStdout: () => void }).__restoreStdout()
    }
  })

  test('/theme dark-ansi accepts the dashed name', async () => {
    const cmd = new ThemeCommand()
    const { ctx } = fakeCtx()
    try {
      await cmd.execute(['dark-ansi'], ctx)
      expect(loadActiveTheme()).toBe('dark-ansi')
    } finally {
      ;(ctx as unknown as { __restoreStdout: () => void }).__restoreStdout()
    }
  })

  test('/theme list emits a card with every theme', async () => {
    const cmd = new ThemeCommand()
    const { ctx, emitted } = fakeCtx()
    try {
      await cmd.execute(['list'], ctx)
      const card = emitted.find((e) => e.kind === 'card')
      expect(card).toBeDefined()
      if (card && card.kind === 'card') {
        const joined = card.sections.flatMap((s) => s.rows.map((r) => `${r.key} ${r.value}`)).join(' ')
        expect(joined).toContain('dark')
        expect(joined).toContain('light')
        expect(joined).toContain('dark-ansi')
      }
    } finally {
      ;(ctx as unknown as { __restoreStdout: () => void }).__restoreStdout()
    }
  })

  test('/theme <unknown> emits a friendly error note', async () => {
    const cmd = new ThemeCommand()
    const { ctx, emitted } = fakeCtx()
    try {
      const result = await cmd.execute(['gibberish'], ctx)
      // command did not crash
      expect(result).toBe(true)
      // The active theme has NOT been changed.
      expect(loadActiveTheme()).toBe('dark')
      const warn = emitted.find((e) => e.kind === 'note' && e.tone === 'warn')
      expect(warn).toBeDefined()
    } finally {
      ;(ctx as unknown as { __restoreStdout: () => void }).__restoreStdout()
    }
  })

  test('non-TUI zero-args path prints the current theme to stdout', async () => {
    const cmd = new ThemeCommand()
    const printed: string[] = []
    const orig = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: string | Uint8Array): boolean => {
      printed.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'))
      return true
    }) as typeof process.stdout.write
    try {
      const noUiCtx: CommandContext = { cwd: '/tmp', session: {} as CommandContext['session'] }
      await cmd.execute([], noUiCtx)
      const text = printed.join('')
      expect(text.toLowerCase()).toContain('theme')
      expect(text).toContain('dark')
    } finally {
      process.stdout.write = orig
    }
  })
})
