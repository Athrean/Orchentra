import { join } from 'node:path'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { DEFAULT_MODEL_ID } from './model-catalog'

export type InitStatus = 'created' | 'updated' | 'skipped'

export interface InitArtifact {
  name: string
  status: InitStatus
}

export interface InitReport {
  projectRoot: string
  artifacts: InitArtifact[]
}

const STARTER_SETTINGS =
  JSON.stringify(
    {
      model: DEFAULT_MODEL_ID,
      permissionMode: 'workspace-write',
      permissions: {
        allow: [],
        deny: [],
        ask: [],
      },
    },
    null,
    2,
  ) + '\n'

const GITIGNORE_ENTRIES = ['.orchentra/settings.local.json', '.orchentra/sessions/', '.orchentra/permissions.json']

function fileExists(path: string): boolean {
  return existsSync(path)
}

export function ensureDir(path: string): InitStatus {
  if (existsSync(path)) {
    return 'skipped'
  }
  mkdirSync(path, { recursive: true })
  return 'created'
}

export function writeFileIfMissing(path: string, content: string): InitStatus {
  if (fileExists(path)) {
    return 'skipped'
  }
  writeFileSync(path, content, 'utf8')
  return 'created'
}

function ensureGitignoreEntries(path: string): InitStatus {
  if (!fileExists(path)) {
    const lines = [...GITIGNORE_ENTRIES]
    writeFileSync(path, lines.join('\n') + '\n', 'utf8')
    return 'created'
  }

  const existing = readFileSync(path, 'utf8')
  const lines = existing.split('\n')
  let changed = false

  for (const entry of GITIGNORE_ENTRIES) {
    if (!lines.includes(entry)) {
      lines.push(entry)
      changed = true
    }
  }

  if (!changed) {
    return 'skipped'
  }

  writeFileSync(path, lines.join('\n'), 'utf8')
  return 'updated'
}

function detectStack(cwd: string): string[] {
  const detected: string[] = []

  if (fileExists(join(cwd, 'tsconfig.json'))) {
    detected.push('TypeScript')
  }

  if (fileExists(join(cwd, 'package.json'))) {
    detected.push('Bun')
  }

  return detected
}

function renderClaudeMd(cwd: string): string {
  const stack = detectStack(cwd)
  const languages = stack.join(', ')

  return `# CLAUDE.md

## Detected stack
- Languages: ${languages}.
- Frameworks: none detected from the supported starter markers.

## Verification
- Run verification from repo root: \`bun run typecheck\`, \`bun run lint\`, \`bun test\`

## Working agreement
- Prefer small, reviewable changes.
`
}

export function initializeRepo(cwd: string): InitReport {
  const artifacts: InitArtifact[] = []

  artifacts.push({
    name: '.orchentra/',
    status: ensureDir(join(cwd, '.orchentra')),
  })

  artifacts.push({
    name: '.orchentra/settings.json',
    status: writeFileIfMissing(join(cwd, '.orchentra', 'settings.json'), STARTER_SETTINGS),
  })

  artifacts.push({
    name: '.orchentra/sessions/',
    status: ensureDir(join(cwd, '.orchentra', 'sessions')),
  })

  artifacts.push({
    name: '.gitignore',
    status: ensureGitignoreEntries(join(cwd, '.gitignore')),
  })

  artifacts.push({
    name: 'CLAUDE.md',
    status: writeFileIfMissing(join(cwd, 'CLAUDE.md'), renderClaudeMd(cwd)),
  })

  return { projectRoot: cwd, artifacts }
}
