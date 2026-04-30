import type { SystemContentBlock } from './types'

// Subscription OAuth tokens require this prefix to be its OWN system block —
// not concatenated into the user's system prompt. With concatenation Anthropic
// returns 429/401 ("This credential is only authorized for use with Claude
// Code"); with two separate blocks the request succeeds. Mirrors the codebuff
// + opencode + claude-code patterns.
const CLAUDE_CODE_SYSTEM_PROMPT_PREFIX = "You are Claude Code, Anthropic's official CLI for Claude."

export interface InjectCacheBoundaryOptions {
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
