import { m, type Variants } from 'framer-motion'
import Image from 'next/image'
import { specialists } from './data'
import { Reveal, softSpring, stagger } from './motion'

const card: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: softSpring },
  hover: { y: -7, transition: { ...softSpring, stiffness: 190 } },
}

const image: Variants = {
  hidden: { scale: 1.025, y: 8 },
  visible: { scale: 1, y: 0, transition: softSpring },
  hover: { scale: 1.045, y: -5, transition: softSpring },
}

export function SpecialistCarousel(): React.ReactNode {
  return (
    <section className="crew-section section-pad" id="crew" aria-labelledby="crew-title">
      <div className="section-frame">
        <Reveal className="section-heading section-heading--crew">
          <p className="eyebrow">The accountable crew</p>
          <h2 id="crew-title">
            Different authority.
            <span>One operating contract.</span>
          </h2>
          <p>
            The supporting roles now live where they belong: inside the specialist they strengthen. Capability surfaces
            differ by role; the shared budget and completion contract do not.
          </p>
        </Reveal>

        <m.div
          className="crew-grid"
          role="list"
          aria-label="Orchentra specialist and supporting agent roles"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.1 }}
          variants={stagger}
        >
          {specialists.map((agent) => (
            <m.article
              className="specialist-card"
              role="listitem"
              key={agent.command}
              variants={card}
              whileHover="hover"
            >
              <div className="specialist-visual">
                <m.div className="specialist-image" variants={image}>
                  <Image
                    src={agent.image}
                    alt=""
                    fill
                    sizes="(max-width: 700px) 88vw, (max-width: 1100px) 44vw, 290px"
                  />
                </m.div>
                <span className="specialist-command">{agent.command}</span>
                <span className="specialist-index">{agent.index}</span>
                <span className="portrait-grid" aria-hidden="true" />
              </div>
              <div className="specialist-copy">
                <p className="card-kicker">
                  {agent.index} / {agent.role}
                </p>
                <h3>{agent.title}</h3>
                <p>{agent.body}</p>
                <div className="support-role">
                  <span>{agent.supportRole}</span>
                  <p>{agent.supportBody}</p>
                </div>
                <div className="tag-row">
                  {agent.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </div>
            </m.article>
          ))}
        </m.div>
      </div>
    </section>
  )
}
