'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'

const NAV_LINKS = [
  { href: '/docs', label: 'Docs' },
  { href: '/#runtime', label: 'Runtime' },
  { href: '/#graph', label: 'Graph' },
  { href: '/pricing', label: 'Pricing' },
] as const

export function NavBar({ loginHref }: { loginHref: string }) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="sticky top-0 z-30 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/stripped.png"
            alt="Orchentra"
            width={28}
            height={28}
            priority
            className="h-7 w-7 object-contain"
          />
          <span className="font-[family-name:var(--font-serif)] text-[20px] font-medium tracking-tight text-[var(--color-pg-text-0)]">
            Orchentra
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm text-[var(--color-pg-text-mute)] transition-colors hover:text-[var(--color-pg-text-0)]"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href={loginHref}
            className="hidden text-sm text-[var(--color-pg-text-mute)] transition-colors hover:text-[var(--color-pg-text-0)] sm:inline"
          >
            Login
          </Link>
          <Link
            href={loginHref}
            className="rounded-full bg-[var(--color-pg-accent-green)] px-4 py-2 text-sm font-medium text-white shadow-[0_4px_14px_-6px_rgba(21,101,69,0.5)] transition-all hover:bg-[var(--color-pg-accent-green-2)] hover:shadow-[0_8px_20px_-8px_rgba(21,101,69,0.6)]"
          >
            Get Orchentra
          </Link>
        </div>
      </div>
    </motion.header>
  )
}
