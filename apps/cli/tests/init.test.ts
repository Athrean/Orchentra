import { test, expect, describe, beforeEach, afterAll } from 'bun:test'
import { join } from 'node:path'
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { initializeRepo } from '../src/init'

const TMP = join(import.meta.dir, '__init_test_tmp__')

function cleanTmp(): void {
  if (existsSync(TMP)) {
    rmSync(TMP, { recursive: true, force: true })
  }
}

beforeEach(cleanTmp)
afterAll(cleanTmp)

describe('initializeRepo', () => {
  test('creates all artifacts in a temp dir', () => {
    mkdirSync(TMP, { recursive: true })

    const report = initializeRepo(TMP)

    expect(existsSync(join(TMP, '.orchentra'))).toBe(true)
    expect(existsSync(join(TMP, '.orchentra', 'settings.json'))).toBe(true)
    expect(existsSync(join(TMP, '.orchentra', 'sessions'))).toBe(true)
    expect(existsSync(join(TMP, '.gitignore'))).toBe(true)
    expect(existsSync(join(TMP, 'CLAUDE.md'))).toBe(true)

    expect(report.projectRoot).toBe(TMP)
    expect(report.artifacts).toHaveLength(5)
    expect(report.artifacts.every((a) => a.status === 'created')).toBe(true)
  })

  test('skips existing settings.json without overwriting', () => {
    mkdirSync(TMP, { recursive: true })
    const settingsPath = join(TMP, '.orchentra', 'settings.json')
    mkdirSync(join(TMP, '.orchentra'), { recursive: true })
    writeFileSync(settingsPath, '{"custom": true}\n', 'utf8')

    const report = initializeRepo(TMP)

    const content = readFileSync(settingsPath, 'utf8')
    expect(content).toBe('{"custom": true}\n')

    const settingsArtifact = report.artifacts.find((a) => a.name === '.orchentra/settings.json')
    expect(settingsArtifact?.status).toBe('skipped')
  })

  test('creates .gitignore if missing', () => {
    mkdirSync(TMP, { recursive: true })

    initializeRepo(TMP)

    const gitignore = readFileSync(join(TMP, '.gitignore'), 'utf8')
    expect(gitignore).toContain('.orchentra/settings.local.json')
    expect(gitignore).toContain('.orchentra/sessions/')
  })

  test('updates .gitignore preserving existing entries', () => {
    mkdirSync(TMP, { recursive: true })
    writeFileSync(join(TMP, '.gitignore'), 'node_modules/\ndist/\n', 'utf8')

    const report = initializeRepo(TMP)

    const gitignore = readFileSync(join(TMP, '.gitignore'), 'utf8')
    expect(gitignore).toContain('node_modules/')
    expect(gitignore).toContain('dist/')
    expect(gitignore).toContain('.orchentra/settings.local.json')
    expect(gitignore).toContain('.orchentra/sessions/')

    const gitignoreArtifact = report.artifacts.find((a) => a.name === '.gitignore')
    expect(gitignoreArtifact?.status).toBe('updated')
  })

  test('creates CLAUDE.md with detected TypeScript stack when tsconfig.json exists', () => {
    mkdirSync(TMP, { recursive: true })
    writeFileSync(join(TMP, 'tsconfig.json'), '{}', 'utf8')

    initializeRepo(TMP)

    const claudeMd = readFileSync(join(TMP, 'CLAUDE.md'), 'utf8')
    expect(claudeMd).toContain('TypeScript')
  })

  test('skips CLAUDE.md if it already exists', () => {
    mkdirSync(TMP, { recursive: true })
    writeFileSync(join(TMP, 'CLAUDE.md'), '# existing guidance\n', 'utf8')

    const report = initializeRepo(TMP)

    const content = readFileSync(join(TMP, 'CLAUDE.md'), 'utf8')
    expect(content).toBe('# existing guidance\n')

    const claudeArtifact = report.artifacts.find((a) => a.name === 'CLAUDE.md')
    expect(claudeArtifact?.status).toBe('skipped')
  })

  test('returns correct artifact statuses on second run', () => {
    mkdirSync(TMP, { recursive: true })

    initializeRepo(TMP)
    const report = initializeRepo(TMP)

    const dirArtifact = report.artifacts.find((a) => a.name === '.orchentra/')
    expect(dirArtifact?.status).toBe('skipped')

    const settingsArtifact = report.artifacts.find((a) => a.name === '.orchentra/settings.json')
    expect(settingsArtifact?.status).toBe('skipped')

    const sessionsArtifact = report.artifacts.find((a) => a.name === '.orchentra/sessions/')
    expect(sessionsArtifact?.status).toBe('skipped')

    const gitignoreArtifact = report.artifacts.find((a) => a.name === '.gitignore')
    expect(gitignoreArtifact?.status).toBe('skipped')

    const claudeArtifact = report.artifacts.find((a) => a.name === 'CLAUDE.md')
    expect(claudeArtifact?.status).toBe('skipped')
  })
})
