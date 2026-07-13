import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

interface PackageJson {
  readonly private?: boolean
  readonly bin?: Record<string, string>
  readonly files?: string[]
  readonly dependencies?: Record<string, string>
  readonly optionalDependencies?: Record<string, string>
  readonly peerDependencies?: Record<string, string>
}

const REQUIRED_BINS: Record<string, string> = {
  orchentra: 'dist/main.js',
  otr: 'dist/main.js',
}

const REQUIRED_FILES = ['dist/main.js', 'dist/keytar-*.node', 'README.md']

export function verifyNpmPackage(packageDir = join(import.meta.dir, '..')): string[] {
  const errors: string[] = []
  const pkg = readPackage(packageDir)

  if (pkg.private === true) errors.push('package.json must not be private')
  if (!sameRecord(pkg.bin, REQUIRED_BINS))
    errors.push('package.json bin must expose orchentra and otr from dist/main.js')
  if (!sameArray(pkg.files, REQUIRED_FILES)) {
    errors.push('package.json files must be exactly: dist/main.js, dist/keytar-*.node, README.md')
  }

  for (const [field, deps] of runtimeDependencyFields(pkg)) {
    for (const [name, version] of Object.entries(deps)) {
      if (version.startsWith('workspace:')) errors.push(`${field}.${name} uses workspace protocol`)
    }
  }

  const distDir = join(packageDir, 'dist')
  const mainPath = join(distDir, 'main.js')
  if (!existsSync(mainPath)) {
    errors.push('dist/main.js is missing; run bun run build first')
  } else {
    const main = readFileSync(mainPath, 'utf8')
    if (!main.startsWith('#!/usr/bin/env bun')) errors.push('dist/main.js must keep the bun shebang')
    if ((statSync(mainPath).mode & 0o111) === 0) errors.push('dist/main.js must be executable')
  }

  if (!existsSync(distDir)) {
    errors.push('dist directory is missing')
  } else if (!readdirSync(distDir).some((file) => /^keytar-[a-z0-9]+\.node$/.test(file))) {
    errors.push('dist keytar native asset is missing')
  }

  return errors
}

function readPackage(packageDir: string): PackageJson {
  return JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as PackageJson
}

function sameRecord(actual: Record<string, string> | undefined, expected: Record<string, string>): boolean {
  const actualEntries = Object.entries(actual ?? {}).sort()
  const expectedEntries = Object.entries(expected).sort()
  return JSON.stringify(actualEntries) === JSON.stringify(expectedEntries)
}

function sameArray(actual: string[] | undefined, expected: string[]): boolean {
  return JSON.stringify(actual ?? []) === JSON.stringify(expected)
}

function runtimeDependencyFields(pkg: PackageJson): Array<[string, Record<string, string>]> {
  return [
    ['dependencies', pkg.dependencies ?? {}],
    ['optionalDependencies', pkg.optionalDependencies ?? {}],
    ['peerDependencies', pkg.peerDependencies ?? {}],
  ]
}

if (import.meta.main) {
  const errors = verifyNpmPackage()
  if (errors.length > 0) {
    process.stderr.write(`npm package verification failed:\n${errors.map((error) => `- ${error}`).join('\n')}\n`)
    process.exit(1)
  }
  process.stdout.write('npm package verification passed\n')
}
