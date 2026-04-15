'use client'

import { useState, useCallback } from 'react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export function useSummarize(
  orgId: string | undefined,
  incidentId: string,
): {
  summary: string
  isSummarizing: boolean
  summaryError: boolean
  summarize: () => Promise<void>
} {
  const [summary, setSummary] = useState('')
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [summaryError, setSummaryError] = useState(false)

  const summarize = useCallback(async () => {
    if (!orgId || isSummarizing) return
    setSummary('')
    setSummaryError(false)
    setIsSummarizing(true)

    try {
      const res = await fetch(`${API_BASE}/api/orgs/${orgId}/incidents/${incidentId}/summarize`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!res.ok || !res.body) {
        setSummaryError(true)
        setIsSummarizing(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      let done = false
      while (!done) {
        const chunk = await reader.read()
        done = chunk.done
        const value = chunk.value
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          // AI SDK data stream format: lines starting with 0: contain text chunks as JSON strings
          if (line.startsWith('0:')) {
            try {
              const text = JSON.parse(line.slice(2)) as string
              setSummary((prev) => prev + text)
            } catch {
              // skip non-JSON lines
            }
          }
        }
      }
    } catch {
      setSummaryError(true)
    } finally {
      setIsSummarizing(false)
    }
  }, [orgId, incidentId, isSummarizing])

  return { summary, isSummarizing, summaryError, summarize }
}
