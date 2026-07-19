import type { Metadata, Viewport } from 'next'
import { GeistPixelCircle } from 'geist/font/pixel'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://orchentra.dev'),
  title: {
    default: 'Orchentra — Ship code with proof attached',
    template: '%s — Orchentra',
  },
  description:
    'The model-aware coding harness for constrained delegation, real verification, and evidence-gated completion.',
  openGraph: {
    title: 'Orchentra — Ship code with proof attached',
    description: 'One accountable coding run, from repository inspection to verified completion.',
    type: 'website',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#080808',
}

export default function RootLayout({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <html lang="en" className={GeistPixelCircle.variable}>
      <body>{children}</body>
    </html>
  )
}
