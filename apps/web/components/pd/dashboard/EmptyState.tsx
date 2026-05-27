import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, GitPullRequest } from 'lucide-react'

export function DashboardEmptyState() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="surface flex w-full max-w-md flex-col items-center gap-6 p-10 text-center">
        <Image src="/mascot.svg" alt="Orchentra" width={48} height={48} className="opacity-90" />
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold tracking-tight text-pg-text-0">No repos tracked yet</h2>
          <p className="text-sm text-pg-text-mute">
            Pick the repos you want Orchentra to surface insights for. Takes 30 seconds.
          </p>
        </div>
        <Link
          href="/onboarding"
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-pg-accent-green)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-pg-accent-green-2)]"
        >
          <GitPullRequest className="h-4 w-4" />
          Select repos
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}
