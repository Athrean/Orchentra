'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Github, Loader2, Mail } from 'lucide-react'
import { createClient } from '../../../lib/supabase/client'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Separator } from '../ui/separator'

export function SignupForm() {
  const router = useRouter()
  const supabase = React.useMemo(() => createClient(), [])
  const [busy, setBusy] = React.useState<'idle' | 'oauth' | 'email'>('idle')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [info, setInfo] = React.useState<string | null>(null)

  async function signUpWithProvider(provider: 'github' | 'google') {
    setBusy('oauth')
    setError(null)
    const origin = process.env.NEXT_PUBLIC_APP_URL ?? (typeof window === 'undefined' ? '' : window.location.origin)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${origin}/auth/callback` },
    })
    if (error) {
      setError(error.message)
      setBusy('idle')
    }
  }

  async function signUpWithEmail(e: React.FormEvent) {
    e.preventDefault()
    setBusy('email')
    setError(null)
    setInfo(null)
    const origin = process.env.NEXT_PUBLIC_APP_URL ?? (typeof window === 'undefined' ? '' : window.location.origin)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${origin}/auth/callback` },
    })
    if (error) {
      setError(error.message)
      setBusy('idle')
      return
    }
    if (data.session) {
      router.push('/dashboard')
      router.refresh()
      return
    }
    setInfo('Check your inbox to confirm your email and finish setup.')
    setBusy('idle')
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-pd-text)]">Create your account</h1>
        <p className="text-sm text-[var(--color-pd-text-muted)]">Identify yourself, link a repo, ship faster</p>
      </div>

      <div className="flex flex-col gap-2">
        <Button variant="outline" size="lg" onClick={() => signUpWithProvider('github')} disabled={busy !== 'idle'}>
          {busy === 'oauth' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
          Continue with GitHub
        </Button>
        <Button variant="outline" size="lg" onClick={() => signUpWithProvider('google')} disabled={busy !== 'idle'}>
          <Mail className="h-4 w-4" />
          Continue with Google
        </Button>
      </div>

      <div className="relative flex items-center">
        <Separator className="flex-1" />
        <span className="px-3 text-[10px] uppercase tracking-wider text-[var(--color-pd-text-subtle)]">or</span>
        <Separator className="flex-1" />
      </div>

      <form onSubmit={signUpWithEmail} className="flex flex-col gap-3">
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
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </div>
        {error ? <p className="text-xs text-red-400">{error}</p> : null}
        {info ? <p className="text-xs text-emerald-400">{info}</p> : null}
        <Button type="submit" size="lg" loading={busy === 'email'} disabled={busy !== 'idle'}>
          Create account
        </Button>
      </form>

      <p className="text-center text-xs text-[var(--color-pd-text-muted)]">
        Already have one?{' '}
        <Link href="/login" className="text-[var(--color-pd-primary)] underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
