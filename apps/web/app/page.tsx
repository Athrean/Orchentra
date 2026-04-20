import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getApiBase, getLoginUrl } from './lib/get-login-url'

export default async function Page(): Promise<React.ReactNode> {
  const cookieStore = await cookies()
  const session = cookieStore.get('orchentra_session')

  let authed = false
  if (session?.value) {
    const apiBase = getApiBase()
    try {
      const res = await fetch(`${apiBase}/api/me`, {
        headers: { Cookie: `orchentra_session=${session.value}` },
        cache: 'no-store',
      })
      if (res.ok) {
        const data = (await res.json()) as { org?: { id?: string } }
        authed = Boolean(data.org?.id)
      }
    } catch {
      // Network error — fall through to login
    }
  }
  if (authed) redirect('/onboarding')

  const loginUrl = getLoginUrl()

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950">
      <div className="text-center">
        <h1 className="mb-2 text-2xl font-semibold text-white">Orchentra</h1>
        <p className="mb-6 text-sm text-neutral-400">AI-native CI/CD observability</p>
        <a
          href={loginUrl}
          className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-200"
        >
          Sign in with GitHub
        </a>
      </div>
    </div>
  )
}
