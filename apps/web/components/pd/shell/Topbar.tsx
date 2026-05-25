import Link from 'next/link'
import { Plus, Search } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { ProfileMenu } from './ProfileMenu'

interface PrimaryAction {
  label: string
  href?: string
}

interface Props {
  title?: string
  email: string | null | undefined
  fullName: string | null | undefined
  avatarUrl: string | null | undefined
  primaryAction?: PrimaryAction
}

export function Topbar({ title, email, fullName, avatarUrl, primaryAction }: Props) {
  return (
    <header className="flex min-h-[3.5rem] items-center gap-4 border-b border-neutral-800 bg-darkest px-6">
      {title ? <h1 className="text-[15px] font-medium tracking-wide text-light">{title}</h1> : null}
      <div className="flex-1" />
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-light/40" />
        <Input placeholder="Search…" className="h-8 w-64 pl-8 text-xs" />
      </div>
      {primaryAction ? (
        primaryAction.href ? (
          <Button asChild variant="primary" size="sm">
            <Link href={primaryAction.href}>
              <Plus className="h-3.5 w-3.5" />
              {primaryAction.label}
            </Link>
          </Button>
        ) : (
          <Button variant="primary" size="sm">
            <Plus className="h-3.5 w-3.5" />
            {primaryAction.label}
          </Button>
        )
      ) : null}
      <ProfileMenu email={email} fullName={fullName} avatarUrl={avatarUrl} />
    </header>
  )
}
