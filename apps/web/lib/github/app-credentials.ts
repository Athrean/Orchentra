import { readFileSync } from 'fs'

export interface AppCredentials {
  appId: string
  privateKey: string
  slug: string
  clientId?: string
  clientSecret?: string
  webhookSecret?: string
}

let cached: AppCredentials | null = null

export function loadAppCredentials(): AppCredentials {
  if (cached) return cached
  const appId = process.env.GITHUB_APP_ID
  if (!appId) throw new Error('GITHUB_APP_ID is required')

  let privateKey = process.env.GITHUB_APP_PRIVATE_KEY
  if (!privateKey) {
    const path = process.env.GITHUB_APP_PRIVATE_KEY_PATH
    if (!path) throw new Error('GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH is required')
    privateKey = readFileSync(path, 'utf8')
  }

  const slug = process.env.GITHUB_APP_SLUG ?? 'orchentra'

  cached = {
    appId,
    privateKey,
    slug,
    clientId: process.env.GITHUB_APP_CLIENT_ID,
    clientSecret: process.env.GITHUB_APP_CLIENT_SECRET,
    webhookSecret: process.env.GITHUB_APP_WEBHOOK_SECRET,
  }
  return cached
}

export function installUrl(state: string): string {
  const { slug } = loadAppCredentials()
  const url = new URL(`https://github.com/apps/${slug}/installations/new`)
  url.searchParams.set('state', state)
  return url.toString()
}
