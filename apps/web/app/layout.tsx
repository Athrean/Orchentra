import type { Metadata, Viewport } from 'next'
import { GeistPixelCircle } from 'geist/font/pixel'
import './globals.css'

export const metadata: Metadata = {
  title: 'Orchentra — Give every coding run a finish line',
  description:
    'A local-first coding harness that plans the work, coordinates specialist agents, runs the real checks, and returns the evidence behind the result.',
  openGraph: {
    title: 'Orchentra — Give every coding run a finish line',
    description: 'Plan the work. Coordinate the crew. Return proof with the result.',
    type: 'website',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f6f6' },
    { media: '(prefers-color-scheme: dark)', color: '#090909' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <html lang="en" className={GeistPixelCircle.variable}>
      <body>{children}</body>
    </html>
  )
}
