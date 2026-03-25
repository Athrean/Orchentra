import * as arctic from 'arctic'
import { eq } from 'drizzle-orm'
import { db, users } from '../db/client'
import { config } from '../config'

function getGitHubClient(): arctic.GitHub {
  const oauth = config.github.oauth
  if (!oauth) throw new Error('GitHub OAuth not configured — set github.oauth in orchentra.yml')
  return new arctic.GitHub(oauth.client_id, oauth.client_secret, oauth.redirect_uri)
}

interface GitHubUserProfile {
  id: number
  login: string
  name: string | null
  avatar_url: string
  email: string | null
}

export function createAuthorizationUrl(): { url: string; state: string } {
  const github = getGitHubClient()
  const state = arctic.generateState()
  const url = github.createAuthorizationURL(state, ['read:user', 'user:email'])
  return { url: url.toString(), state }
}

export async function handleCallback(code: string): Promise<string> {
  const github = getGitHubClient()
  const tokens = await github.validateAuthorizationCode(code)
  const accessToken = tokens.accessToken()

  const response = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`GitHub user API returned ${response.status}`)
  const profile = (await response.json()) as GitHubUserProfile

  // Upsert user
  const existing = await db.select().from(users).where(eq(users.githubId, profile.id)).limit(1)

  if (existing.length > 0) {
    await db
      .update(users)
      .set({
        username: profile.login,
        displayName: profile.name,
        avatarUrl: profile.avatar_url,
        email: profile.email,
        updatedAt: new Date(),
      })
      .where(eq(users.githubId, profile.id))
    return existing[0].id
  }

  const userId = crypto.randomUUID()
  await db.insert(users).values({
    id: userId,
    githubId: profile.id,
    username: profile.login,
    displayName: profile.name,
    avatarUrl: profile.avatar_url,
    email: profile.email,
  })
  return userId
}
