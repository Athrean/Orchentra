import { m, type Variants } from 'framer-motion'
import { GITHUB_URL } from './data'
import { revealItem, softSpring } from './motion'

const heroSequence: Variants = {
  hidden: {},
  visible: { transition: { delayChildren: 0.06, staggerChildren: 0.1 } },
}

const titleLine: Variants = {
  hidden: { y: '108%' },
  visible: { y: 0, transition: { ...softSpring, stiffness: 120, damping: 20 } },
}

const lanes = [
  { role: 'EXPLORE', path: 'M78 82 H350 L712 230 H1080', y: 82 },
  { role: 'PLAN', path: 'M78 180 H410 L712 230 H1080', y: 180 },
  { role: 'BUILD', path: 'M78 280 H410 L712 230 H1080', y: 280 },
  { role: 'VERIFY', path: 'M78 378 H350 L712 230 H1080', y: 378 },
] as const

export function Hero(): React.ReactNode {
  return (
    <m.section
      className="hero"
      id="top"
      aria-labelledby="hero-title"
      initial="hidden"
      animate="visible"
      variants={heroSequence}
    >
      <div className="section-frame">
        <m.p className="eyebrow hero-eyebrow" variants={revealItem}>
          Model-aware coding harness · Local execution · Verifiable completion
        </m.p>
        <m.h1 id="hero-title" variants={heroSequence}>
          <span>
            <m.span variants={titleLine}>The coding loop,</m.span>
          </span>
          <span>
            <m.span variants={titleLine}>closed.</m.span>
          </span>
        </m.h1>

        <m.div className="score-stage" variants={revealItem}>
          <div className="score-topline">
            <span>ORCHESTRATION SCORE / LIVE CONTRACT</span>
            <span>INSPECT → EXECUTE → PROVE</span>
          </div>
          <svg viewBox="0 0 1160 460" role="img" aria-labelledby="score-title score-description">
            <title id="score-title">Four agent lanes converging on a completion gate</title>
            <desc id="score-description">
              Explore, plan, build, and verify work converge before evidence is returned.
            </desc>
            <line className="score-axis" x1="712" y1="45" x2="712" y2="414" />
            {lanes.map((lane, index) => (
              <g key={lane.role}>
                <text className="score-label" x="79" y={lane.y - 18}>
                  {`0${index + 1} / ${lane.role}`}
                </text>
                <path className="score-path" d={lane.path} />
                <rect className="score-node" x={index % 2 === 0 ? 344 : 404} y={lane.y - 6} width="12" height="12" />
              </g>
            ))}
            <rect className="score-gate" x="690" y="208" width="44" height="44" />
            <text className="score-gate-mark" x="712" y="234" textAnchor="middle">
              ✓
            </text>
            <text className="score-output" x="924" y="207">
              EVIDENCE
            </text>
            <text className="score-output score-output--muted" x="924" y="229">
              completion granted
            </text>
            <m.rect
              className="score-runner"
              width="10"
              height="10"
              initial={{ x: 73, y: 77 }}
              animate={{ x: [73, 345, 707, 1075], y: [77, 77, 225, 225] }}
              transition={{
                duration: 4.6,
                times: [0, 0.34, 0.72, 1],
                repeat: Infinity,
                repeatDelay: 1.4,
                ease: 'linear',
              }}
            />
          </svg>
          <div className="score-mobile-output" aria-hidden="true">
            <span>Evidence</span>
            <strong>Pass</strong>
          </div>
        </m.div>

        <m.div className="hero-bottom" variants={revealItem}>
          <div className="hero-counter" aria-hidden="true">
            <span>01</span>
            <span>04</span>
          </div>
          <div className="hero-copy">
            <p>
              Orchentra coordinates specialist agents inside your repository, runs the checks, operates the rendered
              product when it matters, and preserves the evidence behind “done.”
            </p>
            <div className="button-row">
              <a className="button button--dark" href="#install">
                Install Orchentra
              </a>
              <a className="button button--light" href={GITHUB_URL}>
                View GitHub ↗
              </a>
            </div>
          </div>
        </m.div>
      </div>
    </m.section>
  )
}
