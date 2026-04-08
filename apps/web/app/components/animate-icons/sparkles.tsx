'use client'

import React from 'react'
import { motion, type Variants } from 'framer-motion'
import { useAnimateIconContext, IconWrapper, type IconProps } from './icon-wrapper'

const animations = {
  default: {
    main: {
      initial: { rotate: 0, scale: 1 },
      animate: {
        rotate: [0, 15, -10, 0],
        scale: [1, 1.18, 1],
        transition: { duration: 0.7, ease: 'easeInOut' },
      },
    },
    sparkV: {
      initial: { opacity: 1, scaleY: 1 },
      animate: {
        opacity: [0, 1, 0, 1],
        scaleY: [1, 0.3, 1],
        transition: { duration: 0.6, delay: 0.1, ease: 'easeInOut' },
      },
    },
    sparkH: {
      initial: { opacity: 1, scaleX: 1 },
      animate: {
        opacity: [0, 1, 0, 1],
        scaleX: [1, 0.3, 1],
        transition: { duration: 0.6, delay: 0.2, ease: 'easeInOut' },
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
      variants={v.main}
      initial="initial"
      animate={controls}
      style={{ transformOrigin: 'center center' }}
      className={className}
    >
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      <motion.path
        d="M20 3v4"
        variants={v.sparkV}
        initial="initial"
        animate={controls}
        style={{ transformOrigin: '20px 5px' }}
      />
      <motion.path
        d="M22 5h-4"
        variants={v.sparkH}
        initial="initial"
        animate={controls}
        style={{ transformOrigin: '20px 5px' }}
      />
    </motion.svg>
  )
}

export function SparklesIcon(props: IconProps) {
  return <IconWrapper icon={Icon} {...props} />
}
