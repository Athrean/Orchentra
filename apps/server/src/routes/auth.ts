import { Hono } from 'hono'
import { setCookie, getCookie, deleteCookie } from 'hono/cookie'
import { createAuthorizationUrl, handleCallback } from '../auth/oauth'
import { createSession, deleteSession, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '../auth/session'

export const authRouter = new Hono()

const STATE_COOKIE = 'orchentra_oauth_state'
const STATE_MAX_AGE = 600 // 10 minutes
const IS_PRODUCTION = process.env.NODE_ENV === 'production'

authRouter.get('/github', (c) => {
  const { url, state } = createAuthorizationUrl()
  setCookie(c, STATE_COOKIE, state, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'Lax',
    path: '/',
    maxAge: STATE_MAX_AGE,
  })
  return c.redirect(url)
})

authRouter.get('/github/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  const storedState = getCookie(c, STATE_COOKIE)

  // Always clear the state cookie
  deleteCookie(c, STATE_COOKIE, { path: '/' })

  if (!code || !state || !storedState || state !== storedState) {
    return c.json({ error: 'Invalid OAuth state' }, 400)
  }

  try {
    const userId = await handleCallback(code)
    const sessionId = await createSession(userId)

    setCookie(c, SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: 'Lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    })

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
    return c.redirect(`${frontendUrl}/onboarding`)
  } catch (error) {
    console.error('OAuth callback failed:', error)
    return c.json({ error: 'Authentication failed' }, 500)
  }
})

authRouter.post('/logout', async (c) => {
  const sessionId = getCookie(c, SESSION_COOKIE_NAME)
  if (sessionId) {
    await deleteSession(sessionId)
    deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' })
  }
  return c.json({ success: true })
})
