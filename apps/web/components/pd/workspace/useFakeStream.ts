'use client'

export function useFakeStream() {
  return async function fakeStream(prompt: string, onChunk: (s: string) => void) {
    const reply = `Echo: ${prompt}\n\nThis is a placeholder. Wire up /api/chat in Phase B4 to stream real Anthropic/OpenAI tokens.`
    for (const ch of reply) {
      await new Promise((r) => setTimeout(r, 12))
      onChunk(ch)
    }
  }
}
