import type { HookConfig, HookEvent, HookMatch, LifecycleHookEvent } from './types'

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

/**
 * Return the hooks (in declaration order) for a lifecycle `event`. Lifecycle
 * hooks are not tool-scoped, so they match on `event` alone — `tools` is ignored.
 */
export function matchLifecycleHooks(config: HookConfig, event: LifecycleHookEvent): readonly HookMatch[] {
  return config.hooks.filter((h) => h.event === event)
}
