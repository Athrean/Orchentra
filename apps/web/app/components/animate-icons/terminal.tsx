'use client'

import React from 'react'
import { motion, type Variants } from 'framer-motion'
import { useAnimateIconContext, IconWrapper, type IconProps } from './icon-wrapper'

const animations = {
  default: {
    chevron: {
      initial: { x: 0 },
      animate: {
        x: [0, 4, 0],
        transition: { duration: 0.5, ease: 'easeInOut' },
      },
    },
    line: {
      initial: { scaleX: 1, opacity: 1 },
      animate: {
        scaleX: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.4, delay: 0.2, ease: 'easeOut' },
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
      <motion.polyline points="4 17 10 11 4 5" variants={v.chevron} initial="initial" animate={controls} />
      <motion.line
        x1="12"
        y1="19"
        x2="20"
        y2="19"
        variants={v.line}
        initial="initial"
        animate={controls}
        style={{ transformOrigin: '12px 19px' }}
      />
    </motion.svg>
  )
}

export function TerminalIcon(props: IconProps) {
  return <IconWrapper icon={Icon} {...props} />
}
