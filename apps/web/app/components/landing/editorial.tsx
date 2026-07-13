import { m, type Variants } from 'framer-motion'
import { maturityLevels } from './data'
import { Reveal, revealItem, softSpring, stagger } from './motion'

export function EditorialSection({
  id,
  title,
  kicker,
  children,
}: {
  id: string
  title: string
  kicker: string
  children: React.ReactNode
}): React.ReactNode {
  return (
    <section className="editorial" id={id}>
      <div className="content-wrap editorial-grid">
        <Reveal className="editorial-head">
          <h2 className="pixel-type">{title}</h2>
          <p className="section-kicker">{kicker}</p>
        </Reveal>
        <Reveal className="editorial-body" delay={0.08}>
          {children}
        </Reveal>
      </div>
    </section>
  )
}

/* 13×13 pixel-art faces: focused is a clean solid blob, noisy is ragged with
   stray molecules and uneven features */
const FOCUSED_BODY = [
  '.....###.....',
  '...#######...',
  '..#########..',
  '.###########.',
  '.###########.',
  '#############',
  '#############',
  '#############',
  '.###########.',
  '.###########.',
  '..#########..',
  '...#######...',
  '.....###.....',
]

const NOISY_BODY = [
  '....###....#.',
  '..########...',
  '.##########..',
  '.###########.',
  '#####.#######',
  '#############',
  '.############',
  '#############',
  '.##########..',
  '.###########.',
  '..########..#',
  '#...######...',
  '......##.....',
]

const FACE_FEATURES = {
  focused: {
    body: FOCUSED_BODY,
    fill: '#008000',
    eyes: [
      [4, 4],
      [4, 5],
      [8, 4],
      [8, 5],
    ],
    mouth: [
      [4, 8],
      [5, 9],
      [6, 9],
      [7, 9],
      [8, 8],
    ],
  },
  noisy: {
    body: NOISY_BODY,
    fill: '#b9e6b9',
    eyes: [
      [4, 4],
      [4, 5],
      [9, 6],
    ],
    mouth: [
      [4, 9],
      [5, 8],
      [6, 9],
      [7, 8],
      [8, 9],
    ],
  },
} as const

function PixelFace({ mood }: { mood: 'focused' | 'noisy' }): React.ReactNode {
  const face = FACE_FEATURES[mood]
  return (
    <svg viewBox="0 0 13 13" shapeRendering="crispEdges" role="presentation">
      {face.body.flatMap((row, y) =>
        Array.from(row).map((pixel, x) =>
          pixel === '#' ? (
            <rect key={`${x}-${y}`} x={x + 0.06} y={y + 0.06} width={0.88} height={0.88} fill={face.fill} />
          ) : null,
        ),
      )}
      {[...face.eyes, ...face.mouth].map(([x, y]) => (
        <rect key={`f${x}-${y}`} x={x + 0.06} y={y + 0.06} width={0.88} height={0.88} fill="var(--ink)" />
      ))}
    </svg>
  )
}

export function ContrastItem({
  mood,
  label,
  body,
}: {
  mood: 'focused' | 'noisy'
  label: string
  body: string
}): React.ReactNode {
  const face: Variants = {
    idle: { y: 0, rotate: 0, scale: 1 },
    hover:
      mood === 'focused'
        ? { y: -8, rotate: -3, transition: softSpring }
        : { y: 4, scale: 0.95, transition: softSpring },
  }

  return (
    <m.div className="contrast-item" initial="idle" whileHover="hover">
      <m.span className="pixel-face" aria-hidden="true" variants={face}>
        <PixelFace mood={mood} />
      </m.span>
      <p className="contrast-label">{label}</p>
      <p>{body}</p>
    </m.div>
  )
}

export function MaturityList(): React.ReactNode {
  return (
    <m.ul
      className="level-list"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.25 }}
      variants={stagger}
    >
      {maturityLevels.map((item) => (
        <m.li key={item.level} variants={revealItem}>
          <span className="level-code">{item.level}</span>
          <span>
            <strong>{item.title}.</strong> {item.body}
          </span>
        </m.li>
      ))}
    </m.ul>
  )
}
