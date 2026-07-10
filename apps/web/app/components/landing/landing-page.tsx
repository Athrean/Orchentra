'use client'

import { m } from 'framer-motion'
import { SpecialistCarousel, SupportingCarousel } from './crew'
import { PRODUCT_CONTRACT_URL } from './data'
import { ContrastItem, EditorialSection, MaturityList } from './editorial'
import { Hero } from './hero'
import { Footer, InstallCTA } from './install-footer'
import { MotionProvider, Reveal } from './motion'
import { PagePixelField } from './pixel-field'
import { Process, SpineParts } from './process'

export function LandingPage(): React.ReactNode {
  return (
    <MotionProvider>
      <PagePixelField />
      <main>
        <Hero />
        <Intro />
        <SpecialistCarousel />

        <EditorialSection
          id="principle"
          title="Built in the repo, where engineering is accountable."
          kicker="Where we start"
        >
          <p>
            Orchentra runs where the work lives: in your terminal, against your checkout, with the project’s own scripts
            and constraints in view. There is no dashboard pretending to know the repository from a distance.
          </p>
          <p>
            Before a file changes, the crew reads the tree, the package scripts, the framework, the dirty state, and the
            local instructions. The work stays close to the evidence that can prove it.
          </p>
          <p className="editorial-closing">
            Local sessions. Bring your own provider. Zero application database. Git remains the handoff.
          </p>
        </EditorialSection>

        <EditorialSection
          id="judgment"
          title="AI is fast at everything except the last responsible decision."
          kicker="What changed"
        >
          <p>
            Models can draft ten approaches before a developer finishes describing the first. Volume stopped being the
            bottleneck. Choosing what belongs in a real codebase became the work.
          </p>
          <p>
            Orchentra gives that judgment a structure: explicit scope, visible spend, a minimum-code bias, and checks
            that can contradict the agent.
          </p>
          <div className="contrast-grid">
            <ContrastItem
              mood="focused"
              label="Brilliant at"
              body="Searching, drafting, comparing, and getting a concrete option in front of you quickly."
            />
            <ContrastItem
              mood="noisy"
              label="Needs discipline for"
              body="Knowing which option is enough, what should be deleted, and whether the result actually works."
            />
          </div>
          <p className="editorial-closing">The agent can propose the answer. The repository gets the final vote.</p>
        </EditorialSection>

        <Process />

        <EditorialSection id="spine" title="The Orchentra agent spine." kicker="Every agent starts here">
          <p>
            <strong>One operating contract.</strong> Every specialist and subagent inherits the same disciplines before
            task focus is added. That makes the crew coherent instead of a collection of unrelated prompts.
          </p>
          <p>
            The spine spends fewer tokens, writes less code, and keeps review honest. Agent names are the interface; the
            shared behavior is the product.
          </p>
          <m.a className="pixel-button" href={PRODUCT_CONTRACT_URL} whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}>
            Read the product contract <span aria-hidden="true">↗</span>
          </m.a>
        </EditorialSection>

        <SpineParts />

        <EditorialSection id="levels" title="Move from a chat to a coding crew." kicker="How orchestration compounds">
          <p>
            A useful coding agent needs more than a larger model. It needs tools, memory, guardrails, distinct roles,
            and a budget that still holds when work is delegated.
          </p>
          <p>
            Orchentra layers those capabilities without moving the product out of the terminal. Start with one agent;
            add a crew when the task can actually benefit from independent work.
          </p>
          <MaturityList />
          <p className="editorial-closing">
            Parallelism is earned by the shape of the work. Human judgment stays on the calls that matter.
          </p>
        </EditorialSection>

        <SupportingCarousel />
        <InstallCTA />
        <Footer />
      </main>
    </MotionProvider>
  )
}

function Intro(): React.ReactNode {
  return (
    <section className="intro" aria-label="Orchentra point of view">
      <div className="wide-wrap">
        <Reveal>
          <p className="intro-lead pixel-type" data-px-safe>
            Models changed how quickly code appears. They did not change what makes it trustworthy: repo context,
            deliberate scope, and proof from the actual checks. First, meet the crew.
          </p>
        </Reveal>
      </div>
    </section>
  )
}
