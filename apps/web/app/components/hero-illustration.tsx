'use client'

import React, { useEffect, useRef } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import gsap from 'gsap'

export function HeroIllustration({ className }: { className?: string }): React.ReactNode {
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const tl = gsap.timeline({ delay: 0.4 })
    tl.call(() => {
      gsap.to(wrapper, {
        y: -8,
        duration: 3.5,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      })
    })

    return () => {
      tl.kill()
      if (wrapper) gsap.killTweensOf(wrapper)
    }
  }, [])

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, ease: 'easeOut' }}
    >
      <div ref={wrapperRef} className="relative w-full h-auto">
        <Image
          src="/hero-final.svg"
          alt="Human and leaf illustration"
          width={600}
          height={600}
          className="w-full h-auto object-contain select-none pointer-events-none"
          style={{ filter: 'var(--hero-illustration-filter)' }}
          priority
        />
      </div>
    </motion.div>
  )
}
