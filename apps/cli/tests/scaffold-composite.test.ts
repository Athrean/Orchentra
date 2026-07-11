import { test, expect, describe, beforeEach, afterAll } from 'bun:test'
import { join } from 'node:path'
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { writeScaffold } from '../src/composites/scaffold'

const TMP = join(import.meta.dir, '__scaffold_test_tmp__')

function cleanTmp(): void {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true })
}

beforeEach(() => {
  cleanTmp()
  mkdirSync(TMP, { recursive: true })
})
afterAll(cleanTmp)

describe('writeScaffold', () => {
  test('creates a missing file and reports it in created', () => {
    const r = writeScaffold([{ path: 'src/limiter.ts', purpose: 'the limiter' }], TMP)

    expect(existsSync(join(TMP, 'src/limiter.ts'))).toBe(true)
    expect(r.created).toEqual(['src/limiter.ts'])
    expect(r.skipped).toEqual([])
  })

  test('skips an existing file and never overwrites it', () => {
    const abs = join(TMP, 'src/limiter.ts')
    mkdirSync(join(TMP, 'src'), { recursive: true })
    writeFileSync(abs, 'hand-written', 'utf8')

    const r = writeScaffold([{ path: 'src/limiter.ts', purpose: 'the limiter' }], TMP)

    expect(readFileSync(abs, 'utf8')).toBe('hand-written')
    expect(r.skipped).toEqual(['src/limiter.ts'])
    expect(r.created).toEqual([])
  })

  test('creates nested parent dirs for a deep path', () => {
    const r = writeScaffold([{ path: 'packages/cli-tools/src/rate-limit.ts', purpose: 'limiter' }], TMP)

    expect(existsSync(join(TMP, 'packages/cli-tools/src/rate-limit.ts'))).toBe(true)
    expect(r.created).toEqual(['packages/cli-tools/src/rate-limit.ts'])
  })

  test('is idempotent: a second run skips everything', () => {
    const entries = [
      { path: 'src/a.ts', purpose: 'a' },
      { path: 'src/b.ts', purpose: 'b' },
    ]
    writeScaffold(entries, TMP)
    const second = writeScaffold(entries, TMP)

    expect(second.created).toEqual([])
    expect(second.skipped).toEqual(['src/a.ts', 'src/b.ts'])
  })

  test('writes the purpose into the file as a placeholder hint', () => {
    writeScaffold([{ path: 'src/limiter.ts', purpose: 'token-bucket limiter' }], TMP)

    expect(readFileSync(join(TMP, 'src/limiter.ts'), 'utf8')).toContain('token-bucket limiter')
  })

  test('treats a trailing-slash entry as a directory', () => {
    const r = writeScaffold([{ path: 'packages/widget/', purpose: 'example pkg' }], TMP)

    expect(existsSync(join(TMP, 'packages/widget'))).toBe(true)
    expect(r.created).toEqual(['packages/widget/'])
  })
})
