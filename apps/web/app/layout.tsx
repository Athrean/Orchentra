import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Orchentra — terminal AI work with proof built in',
  description:
    'A CLI-first AI coding runtime that plans, builds, reviews, verifies, and explains repository work with green, terminal-native motion.',
  openGraph: {
    title: 'Orchentra',
    description: 'Terminal AI work with visible token spend, scoped diffs, real checks, and execution graph lineage.',
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
