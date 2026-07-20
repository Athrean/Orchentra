import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { HookConfig } from './types'

const HookMatchSchema = z.object({
  event: z.enum([
    'pre_tool_use',
    'post_tool_use',
    'session_start',
    'session_end',
    'pre_compact',
    'post_compact',
    'subagent_start',
    'subagent_stop',
  ]),
  // Required for tool events; optional for lifecycle events, which ignore it.
  tools: z.array(z.string().min(1)).optional().default([]),
  command: z.string().min(1),
})

const HookConfigSchema = z.object({
  version: z.literal(1),
  hooks: z.array(HookMatchSchema),
})

const EMPTY: HookConfig = { version: 1, hooks: [] }

/**
 * Read `.orchentra/hooks.json` relative to `cwd`. Returns an empty config on
 * missing file, malformed JSON, or any schema violation — hooks are an
 * operator-opt-in feature, so a bad config must never block the CLI.
 */
export function loadHooks(cwd: string): HookConfig {
  const path = join(cwd, '.orchentra', 'hooks.json')
  if (!existsSync(path)) return EMPTY

  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return EMPTY
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return EMPTY
  }

  const result = HookConfigSchema.safeParse(parsed)
  if (!result.success) return EMPTY
  return result.data
}
