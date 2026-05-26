'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { saveProfile } from '../../../app/(app)/account/actions'
import { profileEditSchema, type ProfileEdit } from '../../../lib/validators/profile'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'

interface Props {
  initial: ProfileEdit
}

export function ProfileForm({ initial }: Props) {
  const [state, setState] = React.useState<ProfileEdit>(initial)
  const [busy, setBusy] = React.useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = profileEditSchema.safeParse(state)
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

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
      <Field
        label="Avatar URL"
        id="avatarUrl"
        type="url"
        value={state.avatarUrl ?? ''}
        onChange={(v) => setState((s) => ({ ...s, avatarUrl: v || null }))}
      />
      <div className="flex justify-end">
        <Button type="submit" size="md" loading={busy}>
          Save changes
        </Button>
      </div>
    </form>
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
