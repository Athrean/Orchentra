'use client'

import { LazyMotion, MotionConfig, domAnimation, m } from 'framer-motion'

export const referenceEase = [0.12, 0.23, 0.17, 0.99] as const

export function MotionProvider({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  )
}

export function Reveal({
  children,
  className,
  delay = 0,
  amount = 0.18,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
  amount?: number
}): React.ReactNode {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount, margin: '0px 0px -6% 0px' }}
      transition={{ delay, duration: 0.82, ease: referenceEase }}
    >
      {children}
    </m.div>
  )
}

export function HeroReveal({
  children,
  className,
  delay,
  duration = 1,
}: {
  children: React.ReactNode
  className?: string
  delay: number
  duration?: number
}): React.ReactNode {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0.001, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration, ease: referenceEase }}
    >
      {children}
    </m.div>
  )
}
