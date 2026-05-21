'use client'

import { useEffect, useState } from 'react'

export function useTypewriter(text: string, opts: { msPerChar?: number; start: boolean }) {
  const { msPerChar = 24, start } = opts
  const [out, setOut] = useState('')

  useEffect(() => {
    if (!start) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setOut(text)
      return
    }
    let i = 0
    const id = window.setInterval(() => {
      i += 1
      setOut(text.slice(0, i))
      if (i >= text.length) window.clearInterval(id)
    }, msPerChar)
    return () => window.clearInterval(id)
  }, [text, msPerChar, start])

  return out
}
