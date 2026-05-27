'use client'

import * as React from 'react'
import Image from 'next/image'
import { toast } from 'sonner'
import { saveProfile, setAccountPassword } from '../../../app/(app)/account/actions'
import { createClient } from '../../../lib/supabase/client'
import { profileEditSchema, type ProfileEdit } from '../../../lib/validators/profile'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'

interface Props {
  initial: ProfileEdit
  userId?: string
  email?: string | null
  emailVerified?: boolean
  canSetPassword?: boolean
}

export function ProfileForm({ initial, userId, email, emailVerified, canSetPassword }: Props) {
  const [state, setState] = React.useState<ProfileEdit>(initial)
  const [avatarFile, setAvatarFile] = React.useState<File | null>(null)
  const [password, setPassword] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [passwordBusy, setPasswordBusy] = React.useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    let nextState = state
    if (avatarFile && userId) {
      const supabase = createClient()
      const ext = avatarFile.name.split('.').pop() || 'png'
      const path = `${userId}/avatar.${ext}`
      const { error } = await supabase.storage.from('avatars').upload(path, avatarFile, {
        cacheControl: '3600',
        contentType: avatarFile.type,
        upsert: true,
      })
      if (error) {
        toast.error(error.message)
        return
      }
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      nextState = { ...nextState, avatarUrl: data.publicUrl }
      setState(nextState)
    }

    const parsed = profileEditSchema.safeParse(nextState)
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Invalid input')
      return
    }
    setBusy(true)
    try {
      await saveProfile(parsed.data)
      toast.success('Profile saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function onSetPassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordBusy(true)
    try {
      await setAccountPassword(password)
      setPassword('')
      toast.success('Password set')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Password update failed')
    } finally {
      setPasswordBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {email ? (
          <div className="rounded-[8px] bg-pg-surface-0 px-3 py-2 text-sm text-pg-text-0">
            {email}
            <span className="ml-2 rounded-[6px] bg-white px-2 py-0.5 text-xs text-pg-text-mute">
              {emailVerified ? 'Verified' : 'Unverified'}
            </span>
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field
            label="Full name"
            id="fullName"
            value={state.fullName ?? ''}
            onChange={(v) => setState((s) => ({ ...s, fullName: v || null }))}
          />
          <Field
            label="Username"
            id="username"
            value={state.username ?? ''}
            onChange={(v) => setState((s) => ({ ...s, username: v || null }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="avatar">Avatar image</Label>
          <Input
            id="avatar"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
          />
          {state.avatarUrl ? (
            <Image
              src={state.avatarUrl}
              alt=""
              width={56}
              height={56}
              unoptimized
              className="h-14 w-14 rounded-full object-cover"
            />
          ) : null}
        </div>
        <div className="flex justify-end">
          <Button type="submit" size="md" loading={busy}>
            Save changes
          </Button>
        </div>
      </form>

      {canSetPassword ? (
        <form onSubmit={onSetPassword} className="flex flex-col gap-3 rounded-[8px] bg-pg-surface-0 p-4">
          <Field label="Set password" id="newPassword" type="password" value={password} onChange={setPassword} />
          <div className="flex justify-end">
            <Button type="submit" variant="outline" loading={passwordBusy} disabled={password.length < 8}>
              Set password
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  )
}

function Field({
  label,
  id,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  id: string
  value: string
  onChange: (next: string) => void
  type?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}
