import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import './globals.css'

export const metadata: Metadata = {
  title: 'Orchentra — AI incident triage for engineering teams',
  description:
    'Open source AI agent that reads your CI logs, queries observability tools, and delivers a root cause brief on every pipeline failure — in 30 seconds.',
  openGraph: {
    title: 'Orchentra',
    description:
      'Your CI fails. Orchentra investigates. AI agent that reads your GitHub Actions logs, queries Sentry, and posts a root cause brief — in 30 seconds.',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster
          theme="system"
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'var(--color-pg-surface-card)',
              border: '1px solid var(--color-pg-hairline)',
              color: 'var(--color-pg-text-0)',
              borderRadius: '8px',
              fontSize: '12px',
            },
          }}
        />
      </body>
    </html>
  )
}
