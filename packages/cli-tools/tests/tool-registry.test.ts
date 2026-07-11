import { describe, expect, test } from 'bun:test'
import { mkdirSync } from 'node:fs'
import { DefaultToolRegistry, BUILTIN_TOOLS } from '../src/tool-registry'
import type { ToolDefinition, ToolContext } from '@orchentra/cli-core'

const mockCtx: ToolContext = { sessionId: 'test', cwd: '/tmp' }

describe('DefaultToolRegistry', () => {
  test('registers all builtin tools', () => {
    const registry = new DefaultToolRegistry()
    const schemas = registry.list()
    expect(schemas.length).toBe(BUILTIN_TOOLS.length)
    const names = new Set(schemas.map((s) => s.name))
    for (const core of ['bash', 'edit_file', 'glob_search', 'grep_search', 'read_file', 'write_file']) {
      expect(names.has(core)).toBe(true)
    }
  })

  test('has() returns true for builtin tools', () => {
    const registry = new DefaultToolRegistry()
    expect(registry.has('bash')).toBe(true)
    expect(registry.has('read_file')).toBe(true)
    expect(registry.has('write_file')).toBe(true)
    expect(registry.has('edit_file')).toBe(true)
    expect(registry.has('glob_search')).toBe(true)
    expect(registry.has('grep_search')).toBe(true)
  })

  test('has() returns false for unknown tools', () => {
    const registry = new DefaultToolRegistry()
    expect(registry.has('nonexistent')).toBe(false)
  })

  test('execute() returns error for unknown tool', async () => {
    const registry = new DefaultToolRegistry()
    const result = await registry.execute('nonexistent', {}, mockCtx)
    expect(result.isError).toBe(true)
    expect(result.content).toContain('unsupported tool')
  })

  test('register() adds a custom tool', () => {
    const registry = new DefaultToolRegistry()
    const custom: ToolDefinition = {
      name: 'custom_test',
      description: 'test tool',
      level: 'read',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => ({ content: 'custom result', isError: false }),
    }
    registry.register(custom)
    expect(registry.has('custom_test')).toBe(true)
    expect(registry.list().length).toBe(BUILTIN_TOOLS.length + 1)
  })

  test('requirements() derives permission modes from registered tool levels', () => {
    const registry = new DefaultToolRegistry()
    const requirements = registry.requirements()

    expect(requirements.read_file).toBe('read-only')
    expect(requirements.write_file).toBe('workspace-write')
    expect(requirements.bash).toBe('danger-full-access')
    expect(requirements.todo_write).toBe('workspace-write')
    expect(requirements.web_search).toBe('danger-full-access')
  })

  test('requirements() includes custom registrations', () => {
    const registry = new DefaultToolRegistry()
    const custom: ToolDefinition = {
      name: 'custom_admin',
      description: 'test admin tool',
      level: 'admin',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => ({ content: 'custom result', isError: false }),
    }
    registry.register(custom)

    expect(registry.requirements().custom_admin).toBe('danger-full-access')
  })

  test('execute() dispatches to read_file', async () => {
    const registry = new DefaultToolRegistry()
    const path = `/tmp/orchentra-tool-test-${Date.now().toString(36)}.txt`
    await Bun.write(path, 'hello from tool test')

    const result = await registry.execute('read_file', { path }, mockCtx)
    expect(result.isError).toBe(false)
    expect(result.content).toBe('hello from tool test')
  })

  test('execute() dispatches to write_file', async () => {
    const registry = new DefaultToolRegistry()
    const path = `/tmp/orchentra-tool-write-${Date.now().toString(36)}.txt`

    const result = await registry.execute('write_file', { path, content: 'written' }, mockCtx)
    expect(result.isError).toBe(false)
    expect(result.content).toContain('create:')

    const readBack = await Bun.file(path).text()
    expect(readBack).toBe('written')
  })

  test('execute() dispatches to edit_file', async () => {
    const registry = new DefaultToolRegistry()
    const path = `/tmp/orchentra-tool-edit-${Date.now().toString(36)}.txt`
    await Bun.write(path, 'alpha beta')

    const result = await registry.execute('edit_file', { path, old_string: 'alpha', new_string: 'omega' }, mockCtx)
    expect(result.isError).toBe(false)
    expect(result.content).toContain('edited:')

    const readBack = await Bun.file(path).text()
    expect(readBack).toBe('omega beta')
  })

  test('execute() dispatches to glob_search', async () => {
    const registry = new DefaultToolRegistry()
    const dir = `/tmp/orchentra-tool-glob-${Date.now().toString(36)}`
    await Bun.write(`${dir}/a.ts`, 'x')
    await Bun.write(`${dir}/b.txt`, 'y')

    const result = await registry.execute('glob_search', { pattern: '*.ts', path: dir }, mockCtx)
    expect(result.isError).toBe(false)
    expect(result.content).toContain('1 files found')
  })

  test('execute() dispatches to grep_search', async () => {
    const registry = new DefaultToolRegistry()
    const dir = `/tmp/orchentra-tool-grep-${Date.now().toString(36)}`
    await Bun.write(`${dir}/search.txt`, 'findme here')

    const result = await registry.execute(
      'grep_search',
      { pattern: 'findme', path: dir, output_mode: 'files_with_matches' },
      mockCtx,
    )
    expect(result.isError).toBe(false)
    expect(result.content).toContain('1 files matched')
  })

  test('execute() rejects missing command for bash', async () => {
    const registry = new DefaultToolRegistry()
    const result = await registry.execute('bash', {}, mockCtx)
    expect(result.isError).toBe(true)
    expect(result.content).toContain('command is required')
  })

  test('execute() rejects missing path for read_file', async () => {
    const registry = new DefaultToolRegistry()
    const result = await registry.execute('read_file', {}, mockCtx)
    expect(result.isError).toBe(true)
    expect(result.content).toContain('path is required')
  })

  test('execute() rejects missing pattern for grep_search', async () => {
    const registry = new DefaultToolRegistry()
    const result = await registry.execute('grep_search', {}, mockCtx)
    expect(result.isError).toBe(true)
    expect(result.content).toContain('pattern is required')
  })

  test('execute() passes bash permissionMode through validation', async () => {
    const registry = new DefaultToolRegistry()
    const result = await registry.execute(
      'bash',
      { command: 'touch blocked-by-read-only' },
      { ...mockCtx, permissionMode: 'read-only' },
    )
    expect(result.isError).toBe(true)
    expect(result.content).toContain('blocked')
  })

  test('execute() rejects notebook edits outside workspace', async () => {
    const registry = new DefaultToolRegistry()
    const root = `/tmp/orchentra-tool-notebook-${Date.now().toString(36)}`
    const ws = `${root}/workspace`
    const outside = `${root}/outside.ipynb`
    mkdirSync(ws, { recursive: true })
    await Bun.write(
      outside,
      JSON.stringify({
        cells: [{ cell_type: 'markdown', metadata: {}, source: 'before' }],
        metadata: {},
        nbformat: 4,
        nbformat_minor: 5,
      }),
    )

    const result = await registry.execute(
      'notebook_edit',
      { notebook_path: '../outside.ipynb', cell_number: 0, new_source: 'after' },
      { ...mockCtx, cwd: ws },
    )

    expect(result.isError).toBe(true)
    expect(result.content).toContain('escapes workspace')
  })
})

describe('BUILTIN_TOOLS', () => {
  test('exposes the core six tool names', () => {
    const names = new Set(BUILTIN_TOOLS.map((t) => t.name))
    for (const core of ['bash', 'edit_file', 'glob_search', 'grep_search', 'read_file', 'write_file']) {
      expect(names.has(core)).toBe(true)
    }
  })

  test('registers the diagnostics tool', () => {
    const names = new Set(BUILTIN_TOOLS.map((t) => t.name))
    expect(names.has('diagnostics')).toBe(true)
  })

  test('does not advertise placeholder task or cron tools', () => {
    const names = new Set(BUILTIN_TOOLS.map((tool) => tool.name))
    for (const removed of [
      'task_create',
      'task_get',
      'task_list',
      'task_update',
      'task_stop',
      'cron_create',
      'cron_delete',
      'cron_list',
    ]) {
      expect(names.has(removed)).toBe(false)
    }
  })

  test('each tool has required fields', () => {
    for (const tool of BUILTIN_TOOLS) {
      expect(tool.name.length).toBeGreaterThan(0)
      expect(tool.description.length).toBeGreaterThan(0)
      expect(tool.inputSchema).toBeDefined()
      expect(typeof tool.execute).toBe('function')
    }
  })
})
