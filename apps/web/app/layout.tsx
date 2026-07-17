import type { Metadata } from 'next'
import { GeistPixelCircle } from 'geist/font/pixel'
import './globals.css'

export const metadata: Metadata = {
  title: 'Orchentra — The coding loop, closed',
  description:
    'A model-aware coding harness that coordinates specialist agents, runs the code, operates the rendered product, and preserves evidence of completion.',
  openGraph: {
    title: 'Orchentra — The coding loop, closed',
    description: 'Coordinate the crew. Run the checks. Prove the result.',
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
