'use client'

import { AnimatePresence, m } from 'framer-motion'
import { useState } from 'react'
import { referenceEase } from './landing/motion'

export function ContactForm(): React.ReactNode {
  const [sent, setSent] = useState(false)

  return (
    <form
      className="contact-form"
      onSubmit={(event) => {
        event.preventDefault()
        setSent(true)
      }}
    >
      <label>
        <span>NAME</span>
        <input name="name" autoComplete="name" placeholder="Your name" required />
      </label>
      <label>
        <span>WORK EMAIL</span>
        <input name="email" type="email" autoComplete="email" placeholder="you@company.com" required />
      </label>
      <label>
        <span>WHAT ARE YOU BUILDING?</span>
        <textarea name="message" rows={5} placeholder="Tell us about your repository, team, or workflow." required />
      </label>
      <button className="contact-submit" type="submit">
        SEND MESSAGE <span>↗</span>
      </button>
      <AnimatePresence>
        {sent ? (
          <m.p
            className="form-receipt"
            role="status"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: referenceEase }}
          >
            Message captured in this static preview. Delivery can be connected when the public contact endpoint is
            chosen.
          </m.p>
        ) : null}
      </AnimatePresence>
    </form>
  )
}
