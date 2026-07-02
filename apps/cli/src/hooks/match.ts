import type { HookConfig, HookEvent, HookMatch } from './types'

/**
 * Return the hooks (in declaration order) whose `event` matches and whose
 * `tools` list contains either an exact `toolName` or the wildcard `*`.
 */
export function matchHooks(config: HookConfig, event: HookEvent, toolName: string): readonly HookMatch[] {
  const normalizedToolName = toolName.toLowerCase()
  return config.hooks.filter(
    (h) => h.event === event && h.tools.some((tool) => tool === '*' || tool.toLowerCase() === normalizedToolName),
  )
}
