/**
 * A short, searchable tag for a persisted session, derived from its first user
 * prompt. Shown in `/resume` and matched against the search argument so a
 * session can be found by what it was about, not just its opaque id.
 */
export function sessionTag(jsonlText: string): string | null {
  const prompt = firstUserPrompt(jsonlText)
  if (prompt === null) return null
  const slug = slugify(prompt)
  return slug.length > 0 ? slug : null
}

function firstUserPrompt(jsonlText: string): string | null {
  for (const line of jsonlText.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    try {
      const record = JSON.parse(trimmed)
      if (record?.event?.kind === 'user_message' && typeof record.event.content === 'string') {
        return record.event.content
      }
    } catch {
      // skip malformed lines
    }
  }
  return null
}

/** First few words, lowercased and hyphenated, capped so tags stay glanceable. */
function slugify(text: string): string {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
  let slug = ''
  for (const word of words) {
    const candidate = slug ? `${slug}-${word}` : word
    if (candidate.length > 32) break
    slug = candidate
  }
  if (slug === '' && words.length > 0) slug = words[0].slice(0, 32)
  return slug
}
