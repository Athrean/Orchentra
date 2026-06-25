import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Orchentra — the coding crew that spends less and proves its work',
  description:
    'A CLI-first coding crew that spends fewer tokens and writes less, better code — then proves its review by running your tests. Bring your own provider key.',
  openGraph: {
    title: 'Orchentra',
    description: 'The CLI coding crew that spends less, writes less, and proves its review by running the code.',
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
