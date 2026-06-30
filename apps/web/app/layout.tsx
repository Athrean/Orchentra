import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Orchentra — spends less, writes less',
  description:
    'A CLI-first coding crew that spends fewer tokens, writes leaner code, and proves review findings by running repo checks.',
  openGraph: {
    title: 'Orchentra',
    description: 'Spends less. Writes less. Proves its work.',
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
