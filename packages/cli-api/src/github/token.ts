import { homedir } from 'node:os'
import { join } from 'node:path'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

export type TokenSource = 'env' | 'file' | 'gh-cli'

export interface ResolvedToken {
  readonly token: string
  readonly source: TokenSource
}

const ENV_VAR_ORDER = ['ORCHENTRA_GITHUB_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN'] as const
const TOKEN_FILE_MODE = 0o600
const TOKEN_DIR_MODE = 0o700

export function tokenFilePath(home: string = homedir()): string {
  return join(home, '.config', 'orchentra', 'github-token')
}

export interface TokenResolutionEnv {
  readonly env?: NodeJS.ProcessEnv
  readonly home?: string
  readonly ghBinary?: string
}

export function resolveToken(opts: TokenResolutionEnv = {}): ResolvedToken | null {
  const env = opts.env ?? process.env
  for (const name of ENV_VAR_ORDER) {
    const value = env[name]
    if (value && value.trim().length > 0) {
      return { token: value.trim(), source: 'env' }
    }
  }

  const filePath = tokenFilePath(opts.home ?? homedir())
  if (existsSync(filePath)) {
    const contents = readFileSync(filePath, 'utf8').trim()
    if (contents.length > 0) {
      return { token: contents, source: 'file' }
    }
  }

  const ghToken = tryGhAuthToken(opts.ghBinary)
  if (ghToken) {
    return { token: ghToken, source: 'gh-cli' }
  }

  return null
}

export function writeTokenFile(token: string, home: string = homedir()): string {
  const filePath = tokenFilePath(home)
  const dir = join(home, '.config', 'orchentra')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: TOKEN_DIR_MODE })
  }
  writeFileSync(filePath, token, { encoding: 'utf8', mode: TOKEN_FILE_MODE })
  chmodSync(filePath, TOKEN_FILE_MODE)
  return filePath
}

function tryGhAuthToken(ghBinary?: string): string | null {
  const bin = ghBinary ?? 'gh'
  try {
    const result = spawnSync(bin, ['auth', 'token'], { encoding: 'utf8' })
    if (result.status === 0 && typeof result.stdout === 'string') {
      const trimmed = result.stdout.trim()
      if (trimmed.length > 0) return trimmed
    }
    return null
  } catch {
    return null
  }
}

export class MissingGitHubTokenError extends Error {
  constructor() {
    super(
      'No GitHub token available. Set ORCHENTRA_GITHUB_TOKEN or GITHUB_TOKEN, run `orchentra login`, or install gh and run `gh auth login`.',
    )
    this.name = 'MissingGitHubTokenError'
  }
}
