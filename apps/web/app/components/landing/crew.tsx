import { m, type Variants } from 'framer-motion'
import Image from 'next/image'
import { specialists, supportingAgents } from './data'
import { softSpring } from './motion'
import { HorizontalCarousel } from './ui'

/* cards fade in as one aligned row — no per-card y stagger */
const card: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: softSpring },
  hover: { y: -9, transition: { ...softSpring, stiffness: 210 } },
}

const image: Variants = {
  hidden: { scale: 1.03, y: 12 },
  visible: { scale: 1, y: 0, transition: softSpring },
  hover: { scale: 1.055, y: -7, transition: softSpring },
}

export function SpecialistCarousel(): React.ReactNode {
  return (
    <section className="carousel-section" id="crew" aria-labelledby="crew-title">
      <h2 className="sr-only" id="crew-title">
        The Orchentra specialist crew
      </h2>
      <HorizontalCarousel label="Specialist agents">
        {specialists.map((agent) => (
          <m.article
            className="specialist-card"
            key={agent.command}
            initial="hidden"
            whileInView="visible"
            whileHover="hover"
            viewport={{ once: true, amount: 0.18 }}
            variants={card}
          >
            <div className={`specialist-visual specialist-visual--${agent.tone}`}>
              <m.div className="specialist-image" variants={image}>
                <Image src={agent.image} alt="" fill sizes="(max-width: 680px) 90vw, 420px" />
              </m.div>
              <m.span className="specialist-command pixel-type" variants={{ hover: { x: 4, y: -3 } }}>
                {agent.command}
              </m.span>
              <span className="specialist-index">{agent.index}</span>
              <span className="visual-dot-field" aria-hidden="true" />
            </div>
            <p className="card-kicker">
              {agent.index} / {agent.role}
            </p>
            <h3>{agent.title}</h3>
            <p>{agent.body}</p>
          </m.article>
        ))}
      </HorizontalCarousel>
    </section>
  )
}

export function SupportingCarousel(): React.ReactNode {
  return (
    <section className="carousel-section supporting-section" id="agents" aria-labelledby="supporting-title">
      <m.div
        className="content-wrap supporting-head"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.25 }}
        variants={card}
      >
        <h2 id="supporting-title" className="pixel-type">
          Models are everywhere. A disciplined crew isn’t.
        </h2>
        <p>
          Orchentra’s supporting roles have different capability surfaces, not just different names. Read-only means
          read-only. Review can run. Build can write. Every delegated dollar stays visible.
        </p>
      </m.div>

      <HorizontalCarousel label="Supporting agent roles">
        {supportingAgents.map((agent) => (
          <m.article
            className="support-card"
            key={agent.name}
            initial="hidden"
            whileInView="visible"
            whileHover="hover"
            viewport={{ once: true, amount: 0.18 }}
            variants={card}
          >
            <m.div className={`role-visual role-visual--${agent.tone}`} variants={{ hover: { scale: 0.985 } }}>
              <div className="role-status">
                <span>agent/{agent.name.toLowerCase().replace(' ', '-')}</span>
                <span>ready</span>
              </div>
              <m.span
                className="role-mark pixel-type"
                variants={{
                  hidden: { x: '-50%', y: '-48%' },
                  visible: { x: '-50%', y: '-48%' },
                  hover: { x: '-50%', y: '-52%', rotate: -4, scale: 1.06 },
                }}
              >
                {agent.mark}
              </m.span>
              <div className="role-bars" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </div>
            </m.div>
            <p className="card-kicker">{agent.index} / agent type</p>
            <h3>{agent.name}</h3>
            <p>{agent.body}</p>
            <div className="tag-row">
              {agent.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </m.article>
        ))}
      </HorizontalCarousel>
    </section>
  )
}
