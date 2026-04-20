import { describe, expect, test } from 'bun:test'
import { mkdirSync } from 'node:fs'
import {
  writeFile,
  readFile,
  editFile,
  globSearch,
  grepSearch,
  expandBraces,
  isSymlinkEscape,
  readFileInWorkspace,
} from '../src/file-ops'

function tempPath(name: string): string {
  const unique = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  return `/tmp/orchentra-test-${name}-${unique}`
}

describe('writeFile + readFile', () => {
  test('writes and reads a file', async () => {
    const path = tempPath('read-write.txt')
    const writeOutput = await writeFile(path, 'one\ntwo\nthree')
    expect(writeOutput.type).toBe('create')

    const readOutput = await readFile(path, 1, 1)
    expect(readOutput.file.content).toBe('two')
  })

  test('updates existing file', async () => {
    const path = tempPath('update.txt')
    await writeFile(path, 'original')
    const writeOutput = await writeFile(path, 'updated')
    expect(writeOutput.type).toBe('update')
    expect(writeOutput.originalFile).toBe('original')
  })

  test('rejects binary files on read', async () => {
    const path = tempPath('binary.bin')
    await Bun.write(path, Buffer.from([0x00, 0x01, 0x02, 0x03]))
    expect(readFile(path)).rejects.toThrow('binary')
  })
})

describe('editFile', () => {
  test('edits file contents', async () => {
    const path = tempPath('edit.txt')
    await writeFile(path, 'alpha beta alpha')
    const output = await editFile(path, 'alpha', 'omega', true)
    expect(output.replaceAll).toBe(true)

    const readBack = await readFile(path)
    expect(readBack.file.content).toBe('omega beta omega')
  })

  test('rejects identical old and new strings', async () => {
    const path = tempPath('edit-same.txt')
    await writeFile(path, 'content')
    expect(editFile(path, 'content', 'content', false)).rejects.toThrow('must differ')
  })

  test('rejects missing old string', async () => {
    const path = tempPath('edit-missing.txt')
    await writeFile(path, 'hello world')
    expect(editFile(path, 'not found', 'replacement', false)).rejects.toThrow('not found')
  })

  test('replaces first occurrence only', async () => {
    const path = tempPath('edit-first.txt')
    await writeFile(path, 'alpha beta alpha')
    await editFile(path, 'alpha', 'omega', false)
    const readBack = await readFile(path)
    expect(readBack.file.content).toBe('omega beta alpha')
  })
})

describe('globSearch', () => {
  test('finds files matching pattern', async () => {
    const dir = tempPath('glob-dir')
    await Bun.write(`${dir}/a.ts`, 'const a = 1')
    await Bun.write(`${dir}/b.ts`, 'const b = 2')
    await Bun.write(`${dir}/c.txt`, 'hello')

    const result = await globSearch('*.ts', dir)
    expect(result.numFiles).toBe(2)
    expect(result.truncated).toBe(false)
  })
})

describe('grepSearch', () => {
  test('finds matching content', async () => {
    const dir = tempPath('grep-dir')
    await Bun.write(`${dir}/demo.ts`, 'function hello() {\n  return "world"\n}')

    const result = await grepSearch({
      pattern: 'hello',
      path: dir,
      outputMode: 'content',
      lineNumbers: true,
      headLimit: 10,
      offset: 0,
    })
    expect(result.numFiles).toBe(1)
    expect(result.content).toContain('hello')
  })

  test('returns filenames mode', async () => {
    const dir = tempPath('grep-fnames')
    await Bun.write(`${dir}/a.txt`, 'findme')
    await Bun.write(`${dir}/b.txt`, 'no match')

    const result = await grepSearch({
      pattern: 'findme',
      path: dir,
      outputMode: 'files_with_matches',
    })
    expect(result.numFiles).toBe(1)
  })
})

describe('expandBraces', () => {
  test('passes through patterns without braces', () => {
    expect(expandBraces('*.ts')).toEqual(['*.ts'])
  })

  test('expands single brace group', () => {
    const result = expandBraces('src/**/*.{ts,tsx}').sort()
    expect(result).toEqual(['src/**/*.ts', 'src/**/*.tsx'])
  })

  test('handles unmatched braces', () => {
    expect(expandBraces('foo.{bar')).toEqual(['foo.{bar'])
  })

  test('expands nested braces', () => {
    const result = expandBraces('src/{a,b}.{rs,toml}').sort()
    expect(result).toEqual(['src/a.rs', 'src/a.toml', 'src/b.rs', 'src/b.toml'])
  })
})

describe('workspace boundary enforcement', () => {
  test('allows reads inside workspace', async () => {
    const ws = tempPath('ws-inside')
    const filePath = `${ws}/inside.txt`
    await Bun.write(filePath, 'safe content')

    const result = await readFileInWorkspace(filePath, ws)
    expect(result.file.content).toBe('safe content')
  })

  test('rejects reads outside workspace', async () => {
    const ws = tempPath('ws-boundary')
    const outside = tempPath('ws-outside.txt')
    await Bun.write(outside, 'unsafe')

    mkdirSync(ws, { recursive: true })
    expect(readFileInWorkspace(outside, ws)).rejects.toThrow('escapes workspace')
  })
})

describe('isSymlinkEscape', () => {
  test('regular file is not a symlink escape', async () => {
    const ws = tempPath('ws-symlink')
    const filePath = `${ws}/normal.txt`
    await Bun.write(filePath, 'normal')

    const result = await isSymlinkEscape(filePath, ws)
    expect(result).toBe(false)
  })
})
