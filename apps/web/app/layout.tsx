import type { Metadata } from 'next'
import { Instrument_Serif, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google'
import { QueryProvider } from '../lib/query-provider'
import './globals.css'

const instrumentSerif = Instrument_Serif({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
})

const jakarta = Plus_Jakarta_Sans({
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
    'Open source AI agent that reads your CI logs, queries observability tools, and delivers a root cause brief in Slack — in 30 seconds.',
  openGraph: {
    title: 'Orchentra',
    description:
      'Your CI fails. Orchentra investigates. AI agent that reads your GitHub Actions logs, queries Sentry, and posts a root cause brief in Slack — in 30 seconds.',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <html lang="en" className={`${instrumentSerif.variable} ${jakarta.variable} ${jetbrains.variable}`}>
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  )
}
