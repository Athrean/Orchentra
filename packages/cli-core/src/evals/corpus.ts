// Corpus discovery + trial-count resolution. The corpus is a directory of
// `<id>/` eval dirs plus a sibling `lib/` (shared grader harnesses); discovery
// skips `lib/` and dotfiles and requires a meta.json.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { EvalMeta } from './types'

export function loadEvalMeta(evalDir: string): EvalMeta {
  return JSON.parse(readFileSync(join(evalDir, 'meta.json'), 'utf8')) as EvalMeta
}

/** Absolute paths of every eval dir under `corpusDir`, sorted by id. */
export function discoverEvals(corpusDir: string): string[] {
  return readdirSync(corpusDir)
    .filter((name) => name !== 'lib' && !name.startsWith('.'))
    .map((name) => join(corpusDir, name))
    .filter((p) => statSync(p).isDirectory() && existsSync(join(p, 'meta.json')))
    .sort()
}

/**
 * Trials to run for an eval: an explicit override wins; otherwise reliability
 * evals get k=5 and everything else uses meta.k (default 3). Per
 * docs/evals/01-EVAL-STRATEGY.md "Trials".
 */
export function effectiveK(meta: EvalMeta, override?: number): number {
  if (override !== undefined && override > 0) return override
  if (meta.reliability) return 5
  return meta.k > 0 ? meta.k : 3
}
