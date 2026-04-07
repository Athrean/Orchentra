'use client'

import React from 'react'
import { motion, type Variants } from 'framer-motion'
import { useAnimateIconContext, IconWrapper, type IconProps } from './icon-wrapper'

const animations = {
  default: {
    top: {
      initial: { y: 0 },
      animate: { y: -4, transition: { duration: 0.4, ease: 'easeInOut' } },
    },
    mid: {},
    bottom: {
      initial: { y: 0 },
      animate: { y: 4, transition: { duration: 0.4, ease: 'easeInOut' } },
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
        d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"
        variants={v.top}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"
        variants={v.mid}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"
        variants={v.bottom}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  )
}

export function LayersIcon(props: IconProps) {
  return <IconWrapper icon={Icon} {...props} />
}
