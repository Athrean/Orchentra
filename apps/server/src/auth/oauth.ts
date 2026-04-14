import * as arctic from 'arctic'
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
  const url = github.createAuthorizationURL(state, ['read:user', 'user:email', 'repo'])
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

  // Atomic upsert — avoids race condition with concurrent logins
  const [row] = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      githubId: profile.id,
      username: profile.login,
      displayName: profile.name,
      avatarUrl: profile.avatar_url,
      email: profile.email,
      githubAccessToken: accessToken,
    })
    .onConflictDoUpdate({
      target: users.githubId,
      set: {
        username: profile.login,
        displayName: profile.name,
        avatarUrl: profile.avatar_url,
        email: profile.email,
        githubAccessToken: accessToken,
        updatedAt: new Date(),
      },
    })
    .returning({ id: users.id })

  return row.id
}
