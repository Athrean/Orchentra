'use client'

import * as React from 'react'
import Image from 'next/image'
import { toast } from 'sonner'
import { Calendar, Mail, ShieldCheck } from 'lucide-react'
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
  createdAt?: string | null
  authMethod?: string | null
}

export function ProfileForm({ initial, userId, email, emailVerified, canSetPassword, createdAt, authMethod }: Props) {
  const [state, setState] = React.useState<ProfileEdit>(initial)
  const avatarInputRef = React.useRef<HTMLInputElement | null>(null)
  const [avatarBusy, setAvatarBusy] = React.useState(false)
  const [nameBusy, setNameBusy] = React.useState(false)
  const [password, setPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [showConfirm, setShowConfirm] = React.useState(false)
  const [passwordBusy, setPasswordBusy] = React.useState(false)

  async function uploadAvatar(file: File) {
    if (!userId) return
    setAvatarBusy(true)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop() || 'png'
      const path = `${userId}/avatar.${ext}`
      const { error } = await supabase.storage.from('avatars').upload(path, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: true,
      })
      if (error) {
        toast.error(error.message)
        return
      }
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      const nextState = { ...state, avatarUrl: `${data.publicUrl}?v=${Date.now()}` }
      setState(nextState)
      await saveProfile(profileEditSchema.parse(nextState))
      toast.success('Avatar updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setAvatarBusy(false)
    }
  }

  async function removeAvatar() {
    setAvatarBusy(true)
    try {
      const nextState = { ...state, avatarUrl: null }
      setState(nextState)
      await saveProfile(profileEditSchema.parse(nextState))
      toast.success('Avatar removed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Remove failed')
    } finally {
      setAvatarBusy(false)
    }
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault()
    setNameBusy(true)
    try {
      await saveProfile(profileEditSchema.parse(state))
      toast.success('Profile saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setNameBusy(false)
    }
  }

  async function onSetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    setPasswordBusy(true)
    try {
      await setAccountPassword(password)
      setPassword('')
      setConfirmPassword('')
      toast.success('Password set')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Password update failed')
    } finally {
      setPasswordBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Profile Image" description="Your avatar is visible to team members across the workspace.">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pg-surface-1">
            {state.avatarUrl ? (
              <Image
                src={state.avatarUrl}
                alt=""
                width={64}
                height={64}
                unoptimized
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : (
              <span className="text-lg font-medium text-pg-text-mute">
                {(state.fullName ?? email ?? '?').slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void uploadAvatar(file)
                  e.target.value = ''
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                loading={avatarBusy}
                onClick={() => avatarInputRef.current?.click()}
              >
                Upload new image
              </Button>
              {state.avatarUrl ? (
                <Button type="button" variant="outline" size="sm" onClick={() => void removeAvatar()}>
                  Remove
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-pg-text-mute">JPG, PNG, WebP or GIF. Max 5MB.</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Display Name" description="This is the name shown to other team members.">
        <form onSubmit={saveName} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fullName">Name</Label>
            <Input
              id="fullName"
              value={state.fullName ?? ''}
              onChange={(e) => setState((s) => ({ ...s, fullName: e.target.value || null }))}
            />
          </div>
          <div>
            <Button type="submit" size="sm" loading={nameBusy}>
              Save
            </Button>
          </div>
        </form>
      </SectionCard>

      {email ? (
        <SectionCard title="Email Address" description="Your email address is used for sign-in and notifications.">
          <div className="flex items-center gap-2 text-sm text-pg-text-0">
            <Mail className="h-4 w-4 text-pg-text-mute" />
            <span>{email}</span>
            {emailVerified ? (
              <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-pg-accent-green/15 px-2 py-0.5 text-xs font-medium text-pg-accent-green">
                Verified
              </span>
            ) : (
              <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-pg-surface-1 px-2 py-0.5 text-xs text-pg-text-mute">
                Unverified
              </span>
            )}
          </div>
        </SectionCard>
      ) : null}

      {canSetPassword ? (
        <SectionCard
          title="Set Password"
          description="You signed up with another provider. Set a password to also sign in with email and password."
        >
          <form onSubmit={onSetPassword} className="flex flex-col gap-3">
            <PasswordField
              id="newPassword"
              label="New Password"
              value={password}
              onChange={setPassword}
              show={showPassword}
              onToggle={() => setShowPassword((v) => !v)}
              placeholder="Enter new password"
            />
            <PasswordField
              id="confirmPassword"
              label="Confirm New Password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              show={showConfirm}
              onToggle={() => setShowConfirm((v) => !v)}
              placeholder="Confirm new password"
            />
            <div>
              <Button type="submit" size="sm" loading={passwordBusy} disabled={password.length < 8}>
                Set Password
              </Button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard title="Account Information" description="Details about your account and authentication.">
        <div className="flex flex-col gap-2 text-sm text-pg-text-0">
          {createdAt ? (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-pg-text-mute" />
              <span className="text-pg-text-mute">Created:</span>
              <span>{formatDate(createdAt)}</span>
            </div>
          ) : null}
          {authMethod ? (
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-pg-text-mute" />
              <span className="text-pg-text-mute">Auth method:</span>
              <span className="capitalize">{authMethod}</span>
            </div>
          ) : null}
        </div>
      </SectionCard>
    </div>
  )
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-[12px] bg-white p-5 shadow-[0_0_0_1px_rgba(20,20,18,0.06)]">
      <div className="mb-3">
        <div className="text-sm font-semibold text-pg-text-0">{title}</div>
        <div className="mt-0.5 text-xs text-pg-text-mute">{description}</div>
      </div>
      {children}
    </div>
  )
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  show,
  onToggle,
  placeholder,
}: {
  id: string
  label: string
  value: string
  onChange: (next: string) => void
  show: boolean
  onToggle: () => void
  placeholder: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="pr-10"
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-pg-text-mute hover:text-pg-text-0"
        >
          {show ? '✕' : '○'}
        </button>
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}
