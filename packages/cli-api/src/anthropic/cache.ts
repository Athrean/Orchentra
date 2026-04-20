import type { SystemContentBlock } from './types'

export function injectCacheBoundary(systemStatic: string, systemDynamic: string): SystemContentBlock[] {
  const blocks: SystemContentBlock[] = []

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
