'use client'

import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { type ReactNode } from 'react'

const variants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
}

export function Reveal({
  children,
  delay = 0,
  amount = 0.2,
  className,
  as = 'div',
}: {
  children: ReactNode
  delay?: number
  amount?: number
  className?: string
  as?: 'div' | 'section' | 'article' | 'header' | 'footer'
}): React.ReactNode {
  const reduce = useReducedMotion()
  const Tag = motion[as]
  if (reduce) return <Tag className={className}>{children}</Tag>
  return (
    <Tag
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount, margin: '-80px 0px' }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] as const, delay }}
      variants={variants}
    >
      {children}
    </Tag>
  )
}

export function StaggerGroup({
  children,
  className,
  stagger = 0.08,
  amount = 0.15,
}: {
  children: ReactNode
  className?: string
  stagger?: number
  amount?: number
}): React.ReactNode {
  const reduce = useReducedMotion()
  if (reduce) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount, margin: '-80px 0px' }}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: stagger, delayChildren: 0.05 } },
      }}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({
  children,
  className,
  as = 'div',
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'article' | 'li'
}): React.ReactNode {
  const Tag = motion[as]
  return (
    <Tag
      className={className}
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const } },
      }}
    >
      {children}
    </Tag>
  )
}
