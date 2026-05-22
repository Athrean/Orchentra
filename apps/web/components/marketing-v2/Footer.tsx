'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion, useReducedMotion, type Variants } from 'framer-motion'

const SECTIONS = [
  {
    label: 'Product',
    links: [
      { href: '/docs', label: 'Docs' },
      { href: 'https://github.com/Athrean/Orchentra', label: 'GitHub' },
      { href: '/docs/mcp', label: 'MCP' },
    ],
  },
  {
    label: 'Resources',
    links: [
      { href: '/changelog', label: 'Changelog' },
      { href: '/blog', label: 'Blog' },
    ],
  },
  {
    label: 'Legal',
    links: [
      { href: '/legal/privacy', label: 'Privacy' },
      { href: '/legal/terms', label: 'Terms' },
    ],
  },
]

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
}

const ASCII_LANDSCAPE = `         .                       .                                  .
              .                            .                .
                       .       .                                       .
       .          ___       _      ____                  .                  .
            __  /   \\__   / \\___ /    \\___      .                       .
       __ /  \\/        \\_/        \\         \\__       .              __
   ___/                                          \\___       .   ___/
~~                                                       ~~~~~~~
`

export function Footer({ loginHref, version }: { loginHref: string; version: string }) {
  const reduce = useReducedMotion()

  return (
    <footer className="relative overflow-hidden">
      {/* CTA strip */}
      <motion.div
        initial={reduce ? false : 'hidden'}
        whileInView={reduce ? undefined : 'show'}
        viewport={{ once: true, margin: '-100px' }}
        variants={{ show: { transition: { staggerChildren: 0.1 } } }}
        className="relative mx-auto max-w-6xl px-6 pt-24 pb-20 text-center"
      >
        <motion.h2
          variants={fadeUp}
          className="font-[family-name:var(--font-serif)] text-4xl font-medium leading-[1.05] tracking-tight text-[var(--color-pg-text-0)] md:text-[4rem]"
        >
          Get started in{' '}
          <span className="font-[family-name:var(--font-display)] italic text-[var(--color-pg-accent-green)]">
            minutes
          </span>
        </motion.h2>
        <motion.p
          variants={fadeUp}
          className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-[var(--color-pg-text-mute)]"
        >
          One operations registry. CLI, MCP, and a graph that survives the incident. Open source — install and run.
        </motion.p>

        <motion.div variants={fadeUp} className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href={loginHref}
            className="rounded-lg bg-[var(--color-pg-accent-green)] px-6 py-3 text-sm font-medium text-white shadow-[0_8px_24px_-12px_rgba(21,101,69,0.6)] transition-all hover:bg-[var(--color-pg-accent-green-2)] hover:shadow-[0_12px_32px_-12px_rgba(21,101,69,0.7)]"
          >
            Get Orchentra
          </Link>
          <Link
            href="/docs"
            className="rounded-lg bg-[var(--color-pg-surface-1)] px-6 py-3 text-sm font-medium text-[var(--color-pg-text-0)] shadow-[0_4px_14px_-6px_rgba(0,0,0,0.1)] transition-all hover:bg-[var(--color-pg-surface-2)]"
          >
            Read the docs
          </Link>
        </motion.div>
      </motion.div>

      {/* ASCII landscape band */}
      <motion.pre
        aria-hidden="true"
        initial={reduce ? false : { opacity: 0 }}
        whileInView={reduce ? undefined : { opacity: 0.4 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5 }}
        className="mx-auto max-w-6xl px-6 whitespace-pre font-[family-name:var(--font-mono)] text-[10px] leading-[12px] text-[var(--color-pg-text-mute)] select-none md:text-[12px] md:leading-[14px]"
      >
        {ASCII_LANDSCAPE}
      </motion.pre>

      {/* Footer */}
      <div className="mx-auto mt-12 max-w-6xl px-6 pb-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 flex flex-col gap-3 md:col-span-1">
            <Link href="/" className="flex items-center gap-2.5">
              <Image src="/stripped.png" alt="Orchentra" width={24} height={24} className="h-6 w-6 object-contain" />
              <span className="font-[family-name:var(--font-serif)] text-lg font-medium text-[var(--color-pg-text-0)]">
                Orchentra
              </span>
            </Link>
            <p className="text-xs text-[var(--color-pg-text-mute)]">The DevOps runtime that remembers.</p>
          </div>

          {SECTIONS.map((s) => (
            <div key={s.label}>
              <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-pg-text-mute)]">
                {s.label}
              </p>
              <ul className="mt-3 space-y-2">
                {s.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-sm text-[var(--color-pg-text-0)] transition-colors hover:text-[var(--color-pg-accent-green)]"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-2 text-[11px] text-[var(--color-pg-text-mute)] sm:flex-row sm:items-center">
          <span>orchentra · v{version}</span>
          <span>© {new Date().getFullYear()} Athrean. All rights reserved.</span>
        </div>
      </div>
    </footer>
  )
}
