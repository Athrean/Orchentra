import { LazyMotion, MotionConfig, domAnimation, m, type Transition, type Variants } from 'framer-motion'

export const spring: Transition = {
  type: 'spring',
  stiffness: 180,
  damping: 24,
  mass: 0.8,
}

export const softSpring: Transition = {
  type: 'spring',
  stiffness: 105,
  damping: 22,
  mass: 0.9,
}

export const revealItem: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: softSpring },
}

export const stagger: Variants = {
  hidden: {},
  visible: {
    transition: {
      delayChildren: 0.08,
      staggerChildren: 0.09,
    },
  },
}

export function MotionProvider({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user" transition={spring}>
        {children}
      </MotionConfig>
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
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount, margin: '0px 0px -8% 0px' }}
      variants={{
        hidden: { opacity: 0, y: 28 },
        visible: { opacity: 1, y: 0, transition: { ...softSpring, delay } },
      }}
    >
      {children}
    </m.div>
  )
}
