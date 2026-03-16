import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Orchentra",
  description: "AI incident triage for engineering teams",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
