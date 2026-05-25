import { ProfileMenu } from './ProfileMenu'

interface Props {
  title?: string
  email: string | null | undefined
  fullName: string | null | undefined
  avatarUrl: string | null | undefined
}

export function Topbar({ title, email, fullName, avatarUrl }: Props) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-neutral-800 bg-darkest px-6">
      <h1 className="text-sm font-medium tracking-wide text-light">{title ?? ''}</h1>
      <div className="flex items-center gap-2">
        <ProfileMenu email={email} fullName={fullName} avatarUrl={avatarUrl} />
      </div>
    </header>
  )
}
