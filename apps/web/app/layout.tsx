import type { Metadata } from 'next'
import { GeistPixelCircle } from 'geist/font/pixel'
import './globals.css'

export const metadata: Metadata = {
  title: 'Orchentra — Code, orchestrated',
  description:
    'A CLI-first coding crew that plans with intent, writes leaner code, and proves review findings by running the repository checks.',
  openGraph: {
    title: 'Orchentra — Code, orchestrated',
    description: 'Spends less. Writes less. Proves its review by running the code.',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <html lang="en" className={GeistPixelCircle.variable}>
      <body>{children}</body>
    </html>
  )
}
