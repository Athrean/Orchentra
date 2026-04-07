import Image from 'next/image'
import Link from 'next/link'
import { StarIcon } from '../icons'
import { getLoginUrl } from '../../lib/get-login-url'

export function Nav(): React.ReactNode {
  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-hero-bg/85 backdrop-blur-md">
      <nav className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-5 md:py-6">
        <Link href="/" className="flex items-center">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
            <Image
              src="/green-logo.png"
              alt="Orchentra"
              width={76}
              height={76}
              className="absolute h-[76px] w-auto max-w-none object-contain"
            />
          </div>
          <span className="hero-text -ml-1 font-serif text-[34px] tracking-tight md:text-[38px]">Orchentra</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          <Link
            href="#features"
            className="nav-link hero-text-secondary text-[15px] font-medium transition-colors hover:text-(--color-hero-text)"
          >
            Features
          </Link>
          <Link
            href="#use-cases"
            className="nav-link hero-text-secondary text-[15px] font-medium transition-colors hover:text-(--color-hero-text)"
          >
            Use Cases
          </Link>
          <Link
            href="/docs"
            className="nav-link hero-text-secondary text-[15px] font-medium transition-colors hover:text-(--color-hero-text)"
          >
            Docs
          </Link>
          <Link
            href="https://github.com/Athrean/Orchentra"
            target="_blank"
            className="nav-link hero-text-secondary text-[15px] font-medium transition-colors hover:text-(--color-hero-text)"
          >
            GitHub
          </Link>
          <Link
            href="https://github.com/Athrean/Orchentra"
            target="_blank"
            className="nav-link hero-text-secondary flex items-center gap-1.5 text-[15px] font-medium transition-colors hover:text-(--color-hero-text)"
          >
            <StarIcon className="h-4 w-4" />
            Star
          </Link>
        </div>

        <a
          href={getLoginUrl()}
          className="shadow-elevated rounded-full bg-accent px-6 py-2.5 text-[15px] font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          Get Started
        </a>
      </nav>
    </header>
  )
}
