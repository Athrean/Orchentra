'use client'

import React from 'react'
import { motion, type Variants } from 'framer-motion'
import { useAnimateIconContext, IconWrapper, type IconProps } from './icon-wrapper'

const animations = {
  default: {
    book: {
      initial: { rotate: 0 },
      animate: {
        rotate: [0, -8, 0],
        transition: { duration: 0.5, ease: 'easeInOut' },
      },
    },
    page: {
      initial: { d: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20', opacity: 1 },
      animate: {
        x: [0, 2, 0],
        y: [0, -3, 0],
        opacity: [1, 0.6, 1],
        transition: { duration: 0.6, ease: 'easeInOut' },
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
      variants={v.book}
      initial="initial"
      animate={controls}
      style={{ transformOrigin: '4px 20px' }}
    >
      <motion.path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" variants={v.page} initial="initial" animate={controls} />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </motion.svg>
  )
}

export function BookIcon(props: IconProps) {
  return <IconWrapper icon={Icon} {...props} />
}
