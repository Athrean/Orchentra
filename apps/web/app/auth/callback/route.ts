import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '../../../lib/supabase/server'
import { syncUserInstallations } from '../../../lib/github/installation-sync'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/investigate'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`)
  }

  // Discover existing GitHub App installs while the OAuth token is fresh.
  // provider_token is only reliably present here — Supabase drops it on later
  // refreshes — so persisting installs now lets the rest of the app read them
  // from the DB without needing the token again.
  const providerToken = data.session?.provider_token
  const userId = data.session?.user?.id
  if (providerToken && userId) {
    try {
      await syncUserInstallations(userId, providerToken)
    } catch (err) {
      console.warn('[auth/callback] install discovery failed', err)
    }
  }

  return NextResponse.redirect(`${origin}${next}`)
}
