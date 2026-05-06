import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { buildAppOctokit, loadAppCredentialsFromEnv } from '../src/github/octokit-app'

function tempPemDir(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'orchentra-app-test-'))
  const path = join(dir, 'key.pem')
  // Synthetic 2048-bit RSA private key in PKCS#1 PEM. Generated specifically
  // for unit tests — never used against real GitHub. Schema validation only.
  const pem = [
    '-----BEGIN RSA PRIVATE KEY-----',
    'MIIEowIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF32MNAqs5f+lqjgIlxhUeqVrYvmF',
    'placeholderplaceholderplaceholderplaceholderplaceholderplaceholder',
    '-----END RSA PRIVATE KEY-----',
  ].join('\n')
  writeFileSync(path, pem, { mode: 0o600 })
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

describe('loadAppCredentialsFromEnv', () => {
  test('returns null when GITHUB_APP_ID is missing', () => {
    expect(loadAppCredentialsFromEnv({})).toBeNull()
  })

  test('returns null when GITHUB_APP_PRIVATE_KEY_PATH is missing', () => {
    expect(loadAppCredentialsFromEnv({ GITHUB_APP_ID: '12345' })).toBeNull()
  })

  test('returns null when private key file does not exist', () => {
    expect(
      loadAppCredentialsFromEnv({
        GITHUB_APP_ID: '12345',
        GITHUB_APP_PRIVATE_KEY_PATH: '/nonexistent/path/to/key.pem',
      }),
    ).toBeNull()
  })

  test('resolves relative private key path against provided cwd', () => {
    const pem = tempPemDir()
    const dir = pem.path.substring(0, pem.path.lastIndexOf('/'))
    const filename = pem.path.substring(pem.path.lastIndexOf('/') + 1)
    try {
      const creds = loadAppCredentialsFromEnv(
        {
          GITHUB_APP_ID: '3617072',
          GITHUB_APP_PRIVATE_KEY_PATH: filename,
        },
        dir,
      )
      expect(creds).not.toBeNull()
      expect(creds!.privateKey).toContain('BEGIN RSA PRIVATE KEY')
    } finally {
      pem.cleanup()
    }
  })

  test('parses required fields when both env vars set + key readable', () => {
    const pem = tempPemDir()
    try {
      const creds = loadAppCredentialsFromEnv({
        GITHUB_APP_ID: '3617072',
        GITHUB_APP_PRIVATE_KEY_PATH: pem.path,
      })
      expect(creds).not.toBeNull()
      expect(creds!.appId).toBe(3617072)
      expect(creds!.privateKey).toContain('BEGIN RSA PRIVATE KEY')
      expect(creds!.installationId).toBeUndefined()
    } finally {
      pem.cleanup()
    }
  })

  test('coerces installationId from string env var', () => {
    const pem = tempPemDir()
    try {
      const creds = loadAppCredentialsFromEnv({
        GITHUB_APP_ID: '3617072',
        GITHUB_APP_PRIVATE_KEY_PATH: pem.path,
        GITHUB_APP_INSTALLATION_ID: '129899882',
      })
      expect(creds?.installationId).toBe(129899882)
    } finally {
      pem.cleanup()
    }
  })

  test('captures optional client credentials when present', () => {
    const pem = tempPemDir()
    try {
      const creds = loadAppCredentialsFromEnv({
        GITHUB_APP_ID: '3617072',
        GITHUB_APP_PRIVATE_KEY_PATH: pem.path,
        GITHUB_APP_CLIENT_ID: 'Iv1.testclientid000',
        GITHUB_APP_CLIENT_SECRET: 'testsecret',
      })
      expect(creds?.clientId).toBe('Iv1.testclientid000')
      expect(creds?.clientSecret).toBe('testsecret')
    } finally {
      pem.cleanup()
    }
  })

  test('returns null when GITHUB_APP_ID is non-numeric', () => {
    const pem = tempPemDir()
    try {
      expect(
        loadAppCredentialsFromEnv({
          GITHUB_APP_ID: 'not-a-number',
          GITHUB_APP_PRIVATE_KEY_PATH: pem.path,
        }),
      ).toBeNull()
    } finally {
      pem.cleanup()
    }
  })
})

describe('buildAppOctokit', () => {
  test('throws when no installationId on creds nor passed as arg', () => {
    expect(() =>
      buildAppOctokit({
        appId: 3617072,
        privateKey: '-----BEGIN RSA PRIVATE KEY-----\nstub\n-----END RSA PRIVATE KEY-----',
      }),
    ).toThrow(/installationId required/)
  })

  test('returns Octokit-shaped client when installationId set on creds', () => {
    const client = buildAppOctokit({
      appId: 3617072,
      privateKey: '-----BEGIN RSA PRIVATE KEY-----\nstub\n-----END RSA PRIVATE KEY-----',
      installationId: 129899882,
    })
    expect(client).toBeDefined()
    expect(client.repos).toBeDefined()
    expect(client.actions).toBeDefined()
    expect(client.pulls).toBeDefined()
  })

  test('argument installationId overrides creds.installationId', () => {
    const client = buildAppOctokit(
      {
        appId: 3617072,
        privateKey: '-----BEGIN RSA PRIVATE KEY-----\nstub\n-----END RSA PRIVATE KEY-----',
        installationId: 1,
      },
      999,
    )
    expect(client).toBeDefined()
  })
})

// Live integration test — gated behind GITHUB_APP_LIVE=1 so CI without
// real creds skips it. Verifies the App install-token auth path end-to-end:
// JWT mint -> install token exchange -> authenticated GH call.
const liveEnabled = process.env.GITHUB_APP_LIVE === '1'
describe.skipIf(!liveEnabled)('GitHub App live integration', () => {
  test('install-scoped Octokit can fetch Athrean/Orchentra metadata', async () => {
    const creds = loadAppCredentialsFromEnv()
    expect(creds).not.toBeNull()
    expect(creds!.installationId).toBeDefined()

    const client = buildAppOctokit(creds!)
    const res = await client.repos.get({ owner: 'Athrean', repo: 'Orchentra' })

    expect(res.status).toBe(200)
    expect(res.data.name).toBe('Orchentra')
    expect(res.data.private).toBe(true)
    expect(res.data.full_name).toBe('Athrean/Orchentra')
  })
})
