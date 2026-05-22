'use client'

import { motion, useReducedMotion, type MotionProps, type Variants } from 'framer-motion'
import type { ReactNode } from 'react'

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
}

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
}

export function FadeInOnView({
  children,
  delay = 0,
  className,
  as: As = 'div',
  ...rest
}: {
  children: ReactNode
  delay?: number
  className?: string
  as?: 'div' | 'section' | 'article' | 'header' | 'footer'
} & MotionProps) {
  const reduce = useReducedMotion()
  const MotionTag = motion[As] as typeof motion.div
  return (
    <MotionTag
      className={className}
      initial={reduce ? false : 'hidden'}
      whileInView={reduce ? undefined : 'show'}
      viewport={{ once: true, margin: '-80px' }}
      variants={fadeUp}
      transition={{ delay }}
      {...rest}
    >
      {children}
    </MotionTag>
  )
}

export function StaggerChildren({
  children,
  className,
  as: As = 'div',
  ...rest
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'section' | 'ul' | 'ol'
} & MotionProps) {
  const reduce = useReducedMotion()
  const MotionTag = motion[As] as typeof motion.div
  return (
    <MotionTag
      className={className}
      initial={reduce ? false : 'hidden'}
      whileInView={reduce ? undefined : 'show'}
      viewport={{ once: true, margin: '-80px' }}
      variants={stagger}
      {...rest}
    >
      {children}
    </MotionTag>
  )
}

export function StaggerItem({
  children,
  className,
  as: As = 'div',
  ...rest
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'li' | 'span' | 'p' | 'h2' | 'h3'
} & MotionProps) {
  const MotionTag = motion[As] as typeof motion.div
  return (
    <MotionTag className={className} variants={fadeUp} {...rest}>
      {children}
    </MotionTag>
  )
}
