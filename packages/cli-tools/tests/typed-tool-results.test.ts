import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ToolContext } from '@orchentra/cli-core'
import { fileWriteTool } from '../src/tools/file-write-tool'
import { fileEditTool } from '../src/tools/file-edit-tool'
import { fileReadTool } from '../src/tools/file-read-tool'
import { globTool } from '../src/tools/glob-tool'
import { grepTool } from '../src/tools/grep-tool'
import { bashTool } from '../src/tools/bash-tool'

// Every tool result now carries structured data/artifacts/evidence alongside
// the model-facing content string, so traces and completion gates can check
// what actually happened without parsing prose.

function ctx(cwd: string): ToolContext {
  return { sessionId: 'test', cwd }
}

function tempWorkspace(): string {
  return mkdtempSync(join(tmpdir(), 'typed-results-'))
}

describe('typed tool results', () => {
  test('write_file: created artifact + diff evidence', async () => {
    const cwd = tempWorkspace()
    const result = await fileWriteTool.execute({ path: 'a.txt', content: 'hello\n' }, ctx(cwd))

    expect(result.isError).toBe(false)
    expect(result.artifacts).toEqual([{ uri: join(cwd, 'a.txt'), kind: 'file', action: 'created' }])
    expect(result.evidence?.[0]?.kind).toBe('diff')
    expect(result.data).toMatchObject({ bytes: 6 })
  })

  test('write_file over existing file: modified artifact', async () => {
    const cwd = tempWorkspace()
    writeFileSync(join(cwd, 'a.txt'), 'old\n')
    const result = await fileWriteTool.execute({ path: 'a.txt', content: 'new\n' }, ctx(cwd))

    expect(result.artifacts?.[0]?.action).toBe('modified')
  })

  test('edit_file: modified artifact + structured patch hunks as evidence', async () => {
    const cwd = tempWorkspace()
    writeFileSync(join(cwd, 'b.txt'), 'alpha beta gamma\n')
    const result = await fileEditTool.execute({ path: 'b.txt', old_string: 'beta', new_string: 'delta' }, ctx(cwd))

    expect(result.isError).toBe(false)
    expect(result.artifacts).toEqual([{ uri: join(cwd, 'b.txt'), kind: 'file', action: 'modified' }])
    const diff = result.evidence?.find((e) => e.kind === 'diff')
    expect(diff).toBeDefined()
    expect(Array.isArray(diff?.detail)).toBe(true)
  })

  test('read_file: line-range evidence, no artifacts (no side effects)', async () => {
    const cwd = tempWorkspace()
    writeFileSync(join(cwd, 'c.txt'), 'one\ntwo\nthree\n')
    const result = await fileReadTool.execute({ path: 'c.txt' }, ctx(cwd))

    expect(result.isError).toBe(false)
    expect(result.artifacts).toBeUndefined()
    expect(result.evidence?.[0]?.kind).toBe('file-read')
    expect(result.data).toMatchObject({ totalLines: 4 })
  })

  test('glob_search: match-count evidence + structured data', async () => {
    const cwd = tempWorkspace()
    writeFileSync(join(cwd, 'x.ts'), '')
    writeFileSync(join(cwd, 'y.ts'), '')
    const result = await globTool.execute({ pattern: '*.ts' }, ctx(cwd))

    expect(result.isError).toBe(false)
    expect(result.evidence?.[0]?.kind).toBe('matches')
    expect(result.data).toMatchObject({ numFiles: 2, truncated: false })
  })

  test('grep_search: match evidence + full structured output in data', async () => {
    const cwd = tempWorkspace()
    writeFileSync(join(cwd, 'z.txt'), 'needle in haystack\n')
    const result = await grepTool.execute({ pattern: 'needle' }, ctx(cwd))

    expect(result.isError).toBe(false)
    expect(result.evidence?.[0]?.kind).toBe('matches')
    expect(result.data).toMatchObject({ numFiles: 1 })
  })

  test('bash: exit-status evidence on success and failure', async () => {
    const cwd = tempWorkspace()
    const ok = await bashTool.execute({ command: 'true' }, { ...ctx(cwd), permissionMode: 'danger-full-access' })
    expect(ok.isError).toBe(false)
    expect(ok.evidence?.[0]).toMatchObject({ kind: 'exit-status', summary: 'exit code 0' })
    expect(ok.data).toMatchObject({ exitCode: 0 })

    const fail = await bashTool.execute({ command: 'exit 3' }, { ...ctx(cwd), permissionMode: 'danger-full-access' })
    expect(fail.isError).toBe(true)
    expect(fail.evidence?.[0]).toMatchObject({ kind: 'exit-status', summary: 'exit code 3' })
  })
})
