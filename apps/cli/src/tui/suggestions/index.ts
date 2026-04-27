import type { CommandRegistry } from '../../commands/builtin'
import type { SuggestionItem, SuggestionState, SuggestionTrigger } from '../types'
import { fuzzyScore } from './fuzzy'
import { detectTrigger } from './trigger'
import { filterFiles, loadFileIndex, type FileIndex } from './files'

export interface SuggestionContext {
  readonly registry: CommandRegistry
  readonly cwd: string
  /** Recent shell commands for the `!` trigger; most recent first. */
  readonly shellHistory: readonly string[]
  /** Optional file index override (used by tests). */
  readonly fileIndex?: FileIndex
}

const MAX_ITEMS = 8

export async function computeSuggestions(
  buffer: string,
  cursor: number,
  ctx: SuggestionContext,
): Promise<SuggestionState | null> {
  const hit = detectTrigger(buffer, cursor)
  if (hit === null) return null

  const items = await resolveItems(hit.trigger, hit.query, ctx)
  if (items.length === 0) return null

  return {
    open: true,
    trigger: hit.trigger,
    query: hit.query,
    items,
    selected: 0,
    anchorStart: hit.anchorStart,
  }
}

async function resolveItems(
  trigger: SuggestionTrigger,
  query: string,
  ctx: SuggestionContext,
): Promise<SuggestionItem[]> {
  switch (trigger) {
    case '/':
      return filterCommands(ctx.registry, query)
    case '@': {
      const index = ctx.fileIndex ?? (await loadFileIndex(ctx.cwd))
      return filterFiles(index, query, MAX_ITEMS)
    }
    case '!':
      return filterShell(ctx.shellHistory, query)
  }
}

function filterCommands(registry: CommandRegistry, query: string): SuggestionItem[] {
  const specs = registry.allSpecs()
  if (query.length === 0) {
    return specs.slice(0, MAX_ITEMS).map((s) => ({
      value: `/${s.name}`,
      label: s.name,
      description: s.summary,
      hint: s.argumentHint,
    }))
  }
  const scored: { spec: (typeof specs)[number]; score: number }[] = []
  for (const spec of specs) {
    const r = fuzzyScore(query, spec.name)
    if (r === null) continue
    scored.push({ spec, score: r.score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, MAX_ITEMS).map(({ spec }) => ({
    value: `/${spec.name}`,
    label: spec.name,
    description: spec.summary,
    hint: spec.argumentHint,
  }))
}

function filterShell(history: readonly string[], query: string): SuggestionItem[] {
  const items = history.filter((cmd) => cmd.length > 0)
  if (query.length === 0) {
    return items.slice(0, MAX_ITEMS).map((cmd) => ({ value: `!${cmd}`, label: cmd }))
  }
  const scored: { cmd: string; score: number }[] = []
  for (const cmd of items) {
    const r = fuzzyScore(query, cmd)
    if (r === null) continue
    scored.push({ cmd, score: r.score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, MAX_ITEMS).map(({ cmd }) => ({ value: `!${cmd}`, label: cmd }))
}

export { fuzzyScore } from './fuzzy'
export { detectTrigger } from './trigger'
export { loadFileIndex, filterFiles } from './files'
export type { FileIndex } from './files'
