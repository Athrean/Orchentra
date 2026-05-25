import type { ReactNode } from 'react'

export const dynamic = 'force-dynamic'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="pd-bg flex min-h-screen items-center justify-center px-6">
      <div className="absolute inset-0 -z-10 [background-image:radial-gradient(circle_at_top,_rgba(108,68,252,0.12),_transparent_60%)]" />
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}
