import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '../ui/button'

interface PrimaryAction {
  label: string
  href?: string
}

interface Props {
  title?: string
  primaryAction?: PrimaryAction
}

export function Topbar({ title, primaryAction }: Props) {
  if (!title && !primaryAction) return null

  return (
    <header className="relative z-10 flex min-h-[3.5rem] items-center gap-4 bg-transparent px-6">
      {title ? <h1 className="text-[15px] font-medium tracking-wide text-pg-text-0">{title}</h1> : null}
      <div className="flex-1" />
      {primaryAction ? (
        primaryAction.href ? (
          <Button
            asChild
            variant="primary"
            size="sm"
            className="bg-pg-accent-green text-white hover:bg-pg-accent-green-2"
          >
            <Link href={primaryAction.href}>
              <Plus className="h-3.5 w-3.5" />
              {primaryAction.label}
            </Link>
          </Button>
        ) : (
          <Button variant="primary" size="sm" className="bg-pg-accent-green text-white hover:bg-pg-accent-green-2">
            <Plus className="h-3.5 w-3.5" />
            {primaryAction.label}
          </Button>
        )
      ) : null}
    </header>
  )
}
