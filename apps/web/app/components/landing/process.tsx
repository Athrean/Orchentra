import { m } from 'framer-motion'
import { spineParts, workflow } from './data'
import { FieldZone } from './field-zone'
import { Reveal, revealItem, softSpring, stagger } from './motion'

export function Process(): React.ReactNode {
  return (
    <section className="process" id="workflow" aria-labelledby="process-title">
      <div className="content-wrap">
        <Reveal className="process-head">
          <h2 id="process-title" className="pixel-type">
            Read. Plan.
            <br />
            Build. Verify.
          </h2>
          <p>
            The model makes options. The crew turns one option into a checked result, with a role accountable for each
            stage.
          </p>
        </Reveal>
        <FieldZone variant="process" />
        <PartGrid items={workflow} />
      </div>
    </section>
  )
}

export function SpineParts(): React.ReactNode {
  return (
    <section className="spine-parts" aria-labelledby="spine-parts-title">
      <div className="content-wrap">
        <h2 className="sr-only" id="spine-parts-title">
          Four parts of the agent spine
        </h2>
        <FieldZone variant="spine" />
        <PartGrid items={spineParts} />
      </div>
    </section>
  )
}

function PartGrid({
  items,
}: {
  items: ReadonlyArray<{ index: string; title: string; body: string }>
}): React.ReactNode {
  return (
    <m.div
      className="four-part-grid"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      variants={stagger}
    >
      {items.map((item) => (
        <m.article
          className="part"
          key={item.index}
          variants={revealItem}
          whileHover={{ y: -5 }}
          transition={softSpring}
        >
          <div className="part-title">
            <span>{item.index}</span>
            <h3>{item.title}</h3>
          </div>
          <p>{item.body}</p>
          <m.span
            className="part-line"
            aria-hidden="true"
            variants={{
              hidden: { opacity: 0, scaleX: 0 },
              visible: { opacity: 1, scaleX: 1, transition: { ...softSpring, delay: 0.1 } },
            }}
          />
        </m.article>
      ))}
    </m.div>
  )
}
