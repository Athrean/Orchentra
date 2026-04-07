'use client'

import React from 'react'
import { motion, type Variants } from 'framer-motion'
import { useAnimateIconContext, IconWrapper, type IconProps } from './icon-wrapper'

const animations = {
  default: {
    circle: {
      initial: { scale: 1 },
      animate: {
        scale: [1, 1.12, 1],
        transition: { duration: 0.6, ease: 'easeInOut' },
      },
    },
    triangle: {
      initial: { x: 0, scale: 1 },
      animate: {
        x: [0, 2, 0],
        scale: [1, 1.15, 1],
        transition: { duration: 0.5, delay: 0.1, ease: 'easeInOut' },
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
      variants={v.circle}
      initial="initial"
      animate={controls}
      style={{ transformOrigin: 'center center' }}
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <motion.polygon
        points="10 8 16 12 10 16 10 8"
        fill="currentColor"
        stroke="none"
        variants={v.triangle}
        initial="initial"
        animate={controls}
        style={{ transformOrigin: '12px 12px' }}
      />
    </motion.svg>
  )
}

export function PlayIcon(props: IconProps) {
  return <IconWrapper icon={Icon} {...props} />
}
