import { m, useReducedMotion, type Variants } from 'framer-motion'
import { GITHUB_URL } from './data'
import { revealItem, softSpring } from './motion'

const heroSequence: Variants = {
  hidden: {},
  visible: { transition: { delayChildren: 0.05, staggerChildren: 0.09 } },
}

const titleLine: Variants = {
  hidden: { y: '110%' },
  visible: { y: 0, transition: { ...softSpring, stiffness: 120, damping: 20 } },
}

const lanes = [
  { label: 'INSPECT', y: 74, delay: 0 },
  { label: 'PLAN', y: 132, delay: 0.18 },
  { label: 'BUILD', y: 190, delay: 0.36 },
  { label: 'VERIFY', y: 248, delay: 0.54 },
] as const

export function Hero(): React.ReactNode {
  const reduceMotion = useReducedMotion()

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
        <div className="hero-field">
          <m.p className="hero-note" variants={revealItem}>
            Local-first coding orchestration · Open source
          </m.p>
          <m.h1 id="hero-title" variants={heroSequence}>
            <span>
              <m.span variants={titleLine}>Give every coding run</m.span>
            </span>
            <span>
              <m.span variants={titleLine}>a finish line.</m.span>
            </span>
          </m.h1>
          <m.p className="hero-intro" variants={revealItem}>
            Orchentra plans the work, coordinates specialist agents, runs the real checks, and returns the evidence
            behind the result.
          </m.p>
          <m.div className="button-row hero-actions" variants={revealItem}>
            <a className="button button--hero" href="#install">
              Install Orchentra
            </a>
            <a className="button button--ghost" href={GITHUB_URL}>
              View source ↗
            </a>
          </m.div>

          <m.div className="hero-trace" variants={revealItem} aria-hidden="true">
            <div className="hero-trace-head">
              <span>RUN / FEAT-VERIFICATION-PANEL</span>
              <span>COMPLETION CONTRACT · ACTIVE</span>
            </div>
            <svg viewBox="0 0 900 300">
              <line className="trace-spine" x1="690" y1="38" x2="690" y2="268" />
              {lanes.map((lane) => (
                <g key={lane.label}>
                  <text className="trace-label" x="34" y={lane.y - 12}>
                    {lane.label}
                  </text>
                  <path className="trace-lane" d={`M34 ${lane.y} H360 L540 160 H690`} />
                  <m.circle
                    className="trace-pulse"
                    cx="34"
                    cy={lane.y}
                    r="4"
                    animate={
                      reduceMotion ? { cx: 690, cy: 160 } : { cx: [34, 360, 540, 690], cy: [lane.y, lane.y, 160, 160] }
                    }
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : {
                            duration: 3.2,
                            delay: lane.delay,
                            repeat: Infinity,
                            repeatDelay: 2.2,
                            times: [0, 0.42, 0.72, 1],
                            ease: 'linear',
                          }
                    }
                  />
                </g>
              ))}
              <rect className="trace-gate-box" x="674" y="144" width="32" height="32" />
              <text className="trace-gate-check" x="690" y="165" textAnchor="middle">
                ✓
              </text>
              <text className="trace-result" x="746" y="154">
                EVIDENCE
              </text>
              <text className="trace-result trace-result--small" x="746" y="175">
                PASS · RETURN RESULT
              </text>
            </svg>
          </m.div>
        </div>
      </div>
    </m.section>
  )
}
