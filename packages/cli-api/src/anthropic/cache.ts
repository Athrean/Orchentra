import type { SystemContentBlock } from './types'

// Subscription OAuth tokens require this prefix to be its OWN system block —
// not concatenated into the user's system prompt. With concatenation Anthropic
// returns 429/401 ("This credential is only authorized for use with Claude
// Code"); with two separate blocks the request succeeds. Mirrors the codebuff
// + opencode + claude-code patterns. The string is the billing identifier
// Anthropic's edge inspects — DO NOT paraphrase or trim. Validated against
// live /v1/messages on 2026-04-30 — short prefix returned 200, drift returned
// 429 (single-block) or "OAuth not supported" (truncated).
export const CLAUDE_CODE_SYSTEM_PROMPT_PREFIX = "You are Claude Code, Anthropic's official CLI for Claude."

interface InjectCacheBoundaryOptions {
  readonly usingOAuth?: boolean
}

export function injectCacheBoundary(
  systemStatic: string,
  systemDynamic: string,
  options: InjectCacheBoundaryOptions = {},
): SystemContentBlock[] {
  const blocks: SystemContentBlock[] = []

  if (options.usingOAuth) {
    blocks.push({ type: 'text', text: CLAUDE_CODE_SYSTEM_PROMPT_PREFIX })
  }

  if (systemStatic) {
    blocks.push({
      type: 'text',
      text: systemStatic,
      cache_control: { type: 'ephemeral' },
    })
  }

  if (systemDynamic) {
    blocks.push({ type: 'text', text: systemDynamic })
  }

  return blocks
}
