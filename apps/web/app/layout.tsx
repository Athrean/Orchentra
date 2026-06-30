import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Orchentra — CLI-first coding crew',
  description:
    'A local coding-agent CLI that spends fewer tokens, writes less code, and verifies review findings by running the repo checks.',
  openGraph: {
    title: 'Orchentra',
    description: 'CLI-first coding crew with terse output, context budget, lean code, and review gates that run.',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
