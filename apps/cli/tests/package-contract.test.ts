import { describe, expect, test } from 'bun:test'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verifyNpmPackage } from '../scripts/verify-npm-package'

const pkg = JSON.parse(readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8')) as {
  private?: boolean
  bin?: Record<string, string>
  files?: string[]
  publishConfig?: Record<string, string>
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

describe('CLI npm package contract', () => {
  test('is publishable and exposes the built CLI bins', () => {
    expect(pkg.private).not.toBe(true)
    expect(pkg.publishConfig?.access).toBe('public')
    expect(pkg.bin).toEqual({
      orchentra: './dist/main.js',
      otr: './dist/main.js',
    })
  })

  test('packs built artifacts only', () => {
    expect(pkg.files).toEqual(['dist/main.js', 'dist/keytar-*.node', 'README.md'])
  })

  test('does not publish workspace runtime dependencies', () => {
    for (const deps of [pkg.dependencies, pkg.optionalDependencies, pkg.peerDependencies]) {
      for (const version of Object.values(deps ?? {})) {
        expect(version.startsWith('workspace:')).toBe(false)
      }
    }
  })

  test('has an npm dry-run path guarded by the verifier', () => {
    expect(pkg.scripts?.['package:verify']).toBe('bun run scripts/verify-npm-package.ts')
    expect(pkg.scripts?.prepack).toBe('bun run build && bun run package:verify')
    expect(pkg.scripts?.['package:dry-run']).toBe('npm pack --dry-run')
  })

  test('verifier rejects a package without built dist artifacts', () => {
    const dir = writePackageFixture()

    expect(verifyNpmPackage(dir)).toContain('dist/main.js is missing; run bun run build first')
  })

  test('verifier accepts the minimal built package shape', () => {
    const dir = writePackageFixture()
    const dist = join(dir, 'dist')
    mkdirSync(dist)
    const main = join(dist, 'main.js')
    writeFileSync(main, '#!/usr/bin/env bun\nprocess.stdout.write("ok\\n")\n')
    chmodSync(main, 0o755)
    writeFileSync(join(dist, 'keytar-test.node'), '')

    expect(verifyNpmPackage(dir)).toEqual([])
  })
})

function writePackageFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'orchentra-package-'))
  writeFileSync(join(dir, 'README.md'), '# fixture\n')
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({
      name: '@orchentra/cli',
      version: '0.0.0',
      bin: {
        orchentra: './dist/main.js',
        otr: './dist/main.js',
      },
      files: ['dist/main.js', 'dist/keytar-*.node', 'README.md'],
    }),
  )
  return dir
}
