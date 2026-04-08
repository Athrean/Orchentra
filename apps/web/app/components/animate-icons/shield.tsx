'use client'

import React from 'react'
import { motion, type Variants } from 'framer-motion'
import { useAnimateIconContext, IconWrapper, type IconProps } from './icon-wrapper'

const animations = {
  default: {
    shield: {
      initial: { scale: 1 },
      animate: {
        scale: [1, 1.2, 1],
        transition: { duration: 0.6, ease: 'easeInOut' },
      },
    },
    check: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.5, delay: 0.15, ease: 'easeOut' },
      },
    },
  } satisfies Record<string, Variants>,
}

function Icon({ size = 24, className }: IconProps) {
  const { controls } = useAnimateIconContext()
  const v = animations.default

  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <motion.path
        d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
        variants={v.shield}
        initial="initial"
        animate={controls}
        style={{ transformOrigin: 'center center' }}
      />
      <motion.path d="m9 12 2 2 4-4" variants={v.check} initial="initial" animate={controls} />
    </motion.svg>
  )
}

export function ShieldIcon(props: IconProps) {
  return <IconWrapper icon={Icon} {...props} />
}
