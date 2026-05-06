import { readFileSync } from 'fs'
import { isAbsolute, resolve } from 'path'
import { Octokit } from '@octokit/rest'
import { createAppAuth } from '@octokit/auth-app'
import { z } from 'zod'
import type { OctokitLike } from './octokit'

const AppCredentialsSchema = z.object({
  appId: z.coerce.number().int().positive(),
  privateKey: z.string().min(1),
  installationId: z.coerce.number().int().positive().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
})

export type AppCredentials = z.infer<typeof AppCredentialsSchema>

export function loadAppCredentialsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): AppCredentials | null {
  const appId = env.GITHUB_APP_ID
  const privateKeyPath = env.GITHUB_APP_PRIVATE_KEY_PATH
  if (!appId || !privateKeyPath) return null
  // Relative paths resolve against cwd (typically the repo root) so the
  // env file can stay portable. Absolute paths pass through.
  const resolvedPath = isAbsolute(privateKeyPath) ? privateKeyPath : resolve(cwd, privateKeyPath)
  let privateKey: string
  try {
    privateKey = readFileSync(resolvedPath, 'utf-8')
  } catch {
    // Surface the failure so a bad path isn't silently downgraded to PAT.
    console.warn(
      `[github-app] GITHUB_APP_PRIVATE_KEY_PATH set to "${privateKeyPath}" but file not readable at "${resolvedPath}". Falling back to PAT auth.`,
    )
    return null
  }
  const parsed = AppCredentialsSchema.safeParse({
    appId,
    privateKey,
    installationId: env.GITHUB_APP_INSTALLATION_ID,
    clientId: env.GITHUB_APP_CLIENT_ID,
    clientSecret: env.GITHUB_APP_CLIENT_SECRET,
  })
  if (!parsed.success) return null
  return parsed.data
}

export function buildAppOctokit(creds: AppCredentials, installationId?: number): OctokitLike {
  const targetInstallId = installationId ?? creds.installationId
  if (!targetInstallId) {
    throw new Error('buildAppOctokit: installationId required. Pass arg or set GITHUB_APP_INSTALLATION_ID.')
  }
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: creds.appId,
      privateKey: creds.privateKey,
      installationId: targetInstallId,
      ...(creds.clientId ? { clientId: creds.clientId } : {}),
      ...(creds.clientSecret ? { clientSecret: creds.clientSecret } : {}),
    },
  })
}
