import type { ReactNode } from 'react'

export const dynamic = 'force-dynamic'

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-darkest text-light">
      <div className="absolute inset-0 -z-10 [background-image:radial-gradient(circle_at_top,_rgba(35,164,112,0.10),_transparent_55%)]" />
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-6 py-10">{children}</main>
    </div>
  )
}
