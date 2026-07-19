'use client'

import {
  LazyMotion,
  MotionConfig,
  animate,
  domAnimation,
  m,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type Variants,
} from 'framer-motion'
import { useEffect, useRef } from 'react'

export const referenceEase = [0.12, 0.23, 0.17, 0.99] as const

export const revealItem: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.82, ease: referenceEase },
  },
}

export const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
}

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

export function CountUp({
  value,
  suffix = '',
  prefix = '',
}: {
  value: number
  suffix?: string
  prefix?: string
}): React.ReactNode {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.8 })
  const reduceMotion = useReducedMotion()
  const motionValue = useMotionValue(0)
  const rounded = useTransform(motionValue, (latest) => `${prefix}${Math.round(latest).toLocaleString()}${suffix}`)

  useEffect(() => {
    if (!inView) return
    if (reduceMotion) {
      motionValue.set(value)
      return
    }
    const controls = animate(motionValue, value, { duration: 1.25, ease: referenceEase })
    return () => controls.stop()
  }, [inView, motionValue, reduceMotion, value])

  return <m.span ref={ref}>{rounded}</m.span>
}
