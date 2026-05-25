import type { Metadata } from 'next'
import { Source_Serif_4, Inter, JetBrains_Mono, Cormorant_Garamond } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
})

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-display',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

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
    <html lang="en" className={`${sourceSerif.variable} ${cormorant.variable} ${inter.variable} ${jetbrains.variable}`}>
      <body>
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'var(--color-pd-surface)',
              border: '1px solid var(--color-pd-border)',
              color: 'var(--color-pd-text)',
              borderRadius: '4px',
              fontSize: '12px',
            },
          }}
        />
      </body>
    </html>
  )
}
