'use client'

import React, { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useAnimation } from 'framer-motion'

/* ── Context for animated icons ── */
interface AnimateIconContextValue {
  controls: ReturnType<typeof useAnimation>
}

const AnimateIconContext = createContext<AnimateIconContextValue | null>(null)

export function useAnimateIconContext(): AnimateIconContextValue {
  const ctx = useContext(AnimateIconContext)
  if (!ctx) throw new Error('useAnimateIconContext must be used within IconWrapper')
  return ctx
}

/* ── Shared types ── */
export interface IconProps {
  size?: number
  className?: string
}

/* ── Wrapper: continuously loops animation ── */
interface IconWrapperProps extends IconProps {
  icon: React.ComponentType<IconProps>
  delay?: number
}

export function IconWrapper({ icon: Icon, delay = 0, ...props }: IconWrapperProps): ReactNode {
  const controls = useAnimation()

  useEffect(() => {
    let cancelled = false
    const loop = async () => {
      if (delay > 0) await new Promise((r) => setTimeout(r, delay))
      while (!cancelled) {
        await controls.start('animate')
        await new Promise((r) => setTimeout(r, 800))
        if (!cancelled) await controls.start('initial')
        await new Promise((r) => setTimeout(r, 400))
      }
    }
    loop()
    return () => {
      cancelled = true
    }
  }, [controls, delay])

  return (
    <AnimateIconContext.Provider value={{ controls }}>
      <span className="inline-flex">
        <Icon {...props} />
      </span>
    </AnimateIconContext.Provider>
  )
}
