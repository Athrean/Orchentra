import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const TOKEN_DIR = join(homedir(), '.orchentra')
const TOKEN_FILE = join(TOKEN_DIR, 'github-token')
const SCOPES = ['repo', 'read:org', 'workflow']

const ENV_CLIENT_ID = 'ORCHENTRA_GITHUB_CLIENT_ID'
const ENV_GITHUB_TOKEN = 'GITHUB_TOKEN'
const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token'

interface StoredToken {
  token: string
  createdAt: number
  scopes: string[]
}

export interface DeviceFlowResult {
  token: string
  scopes: string[]
}

function clientId(): string {
  const id = process.env[ENV_CLIENT_ID]
  if (!id) {
    throw new Error(
      `${ENV_CLIENT_ID} is not set. Register a GitHub OAuth app and export the client ID, or run \`gh auth login\` to use the gh CLI fallback.`,
    )
  }
  return id
}

export async function getGitHubToken(): Promise<string> {
  const stored = await loadStoredToken()
  if (stored) return stored

  const ghToken = await ghCliToken()
  if (ghToken) return ghToken

  throw new Error('No GitHub token found. Run `orchentra auth login` to authenticate, or set GITHUB_TOKEN.')
}

export async function login(): Promise<string> {
  const stored = await loadStoredToken()
  if (stored) {
    process.stdout.write('Already authenticated. Use `orchestra auth logout` to reset.\n')
    return stored
  }

  const envToken = process.env[ENV_GITHUB_TOKEN]
  if (envToken) {
    await saveToken(envToken, ['env'])
    process.stdout.write('Saved GITHUB_TOKEN to credential store.\n')
    return envToken
  }

  const result = await deviceFlow()
  await saveToken(result.token, result.scopes)
  process.stdout.write('Authentication successful.\n')
  return result.token
}

export async function logout(): Promise<void> {
  try {
    const { unlink } = await import('node:fs/promises')
    await unlink(TOKEN_FILE)
    process.stdout.write('Logged out.\n')
  } catch {
    process.stdout.write('No stored credentials to remove.\n')
  }
}

export async function deviceFlow(): Promise<DeviceFlowResult> {
  const id = clientId()

  const codeResp = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: id, scope: SCOPES.join(' ') }),
  })

  if (!codeResp.ok) {
    throw new Error(`Device code request failed: ${codeResp.status} ${await codeResp.text()}`)
  }

  const codeData = (await codeResp.json()) as {
    device_code: string
    user_code: string
    verification_uri: string
    interval: number
    expires_in: number
  }

  process.stdout.write(`\n  Enter code: ${codeData.user_code}\n`)
  process.stdout.write(`  At: ${codeData.verification_uri}\n\n`)

  const intervalMs = codeData.interval * 1000
  const deadline = Date.now() + codeData.expires_in * 1000

  while (Date.now() < deadline) {
    await sleep(intervalMs)

    const tokenResp = await fetch(ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: id,
        device_code: codeData.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    })

    const tokenData = (await tokenResp.json()) as Record<string, string>

    if (tokenData.access_token) {
      return {
        token: tokenData.access_token,
        scopes: tokenData.scope?.split(',') ?? SCOPES,
      }
    }

    if (tokenData.error === 'authorization_pending') continue
    if (tokenData.error === 'slow_down') {
      await sleep(5000)
      continue
    }

    throw new Error(`Device flow error: ${tokenData.error_description ?? tokenData.error}`)
  }

  throw new Error('Device flow timed out. Please try again.')
}

async function loadStoredToken(): Promise<string | null> {
  try {
    const raw = await readFile(TOKEN_FILE, 'utf-8')
    const data = JSON.parse(raw) as StoredToken
    return data.token || null
  } catch {
    return null
  }
}

async function saveToken(token: string, scopes: string[]): Promise<void> {
  await mkdir(dirname(TOKEN_FILE), { recursive: true })
  const data: StoredToken = { token, createdAt: Date.now(), scopes }
  await writeFile(TOKEN_FILE, JSON.stringify(data, null, 2), { mode: 0o600 })
}

async function ghCliToken(): Promise<string | null> {
  try {
    const result = await execAsync('gh', ['auth', 'token'])
    const trimmed = result.trim()
    return trimmed.length > 0 ? trimmed : null
  } catch {
    return null
  }
}

function execAsync(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 5000 }, (err, stdout) => {
      if (err) reject(err)
      else resolve(stdout)
    })
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
