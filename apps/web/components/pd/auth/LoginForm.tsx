'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Github, Loader2, Mail } from 'lucide-react'
import { createClient } from '../../../lib/supabase/client'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Separator } from '../ui/separator'

type Mode = 'idle' | 'oauth' | 'email'

export function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') ?? '/dashboard'
  const supabase = React.useMemo(() => createClient(), [])
  const [mode, setMode] = React.useState<Mode>('idle')
  const [error, setError] = React.useState<string | null>(null)
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')

  async function signInWithProvider(provider: 'github' | 'google') {
    setMode('oauth')
    setError(null)
    const origin = process.env.NEXT_PUBLIC_APP_URL ?? (typeof window === 'undefined' ? '' : window.location.origin)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
    })
    if (error) {
      setError(error.message)
      setMode('idle')
    }
  }

  async function signInWithEmail(e: React.FormEvent) {
    e.preventDefault()
    setMode('email')
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setMode('idle')
      return
    }
    router.push(next)
    router.refresh()
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-pd-text)]">Welcome back</h1>
        <p className="text-sm text-[var(--color-pd-text-muted)]">Sign in to your Orchentra workspace</p>
      </div>

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => signInWithProvider('github')}
          disabled={mode !== 'idle'}
        >
          {mode === 'oauth' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
          Continue with GitHub
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => signInWithProvider('google')}
          disabled={mode !== 'idle'}
        >
          <Mail className="h-4 w-4" />
          Continue with Google
        </Button>
      </div>

      <div className="relative flex items-center">
        <Separator className="flex-1" />
        <span className="px-3 text-[10px] uppercase tracking-wider text-[var(--color-pd-text-subtle)]">or</span>
        <Separator className="flex-1" />
      </div>

      <form onSubmit={signInWithEmail} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        {error ? <p className="text-xs text-red-400">{error}</p> : null}
        <Button type="submit" size="lg" loading={mode === 'email'} disabled={mode !== 'idle'}>
          Sign in
        </Button>
      </form>

      <p className="text-center text-xs text-[var(--color-pd-text-muted)]">
        No account?{' '}
        <Link href="/signup" className="text-[var(--color-pd-primary)] underline-offset-4 hover:underline">
          Create one
        </Link>
      </p>
    </div>
  )
}
