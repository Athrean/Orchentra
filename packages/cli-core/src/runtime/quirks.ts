/**
 * Per-model deviation counters: how often a model produced malformed tool
 * args, called an unknown tool, or hit some other harness-visible quirk.
 * M5's per-family specialization must be justified by measured counters, not
 * vibes — this is the measurement side. Deliberately minimal: a counter map
 * with an accessor, not a subsystem.
 */

export type QuirkKind = 'malformed_args' | 'unknown_tool' | 'provider_error'

export class QuirkCounters {
  private readonly byModel = new Map<string, Map<QuirkKind, number>>()

  record(model: string, kind: QuirkKind): void {
    const counts = this.byModel.get(model) ?? new Map<QuirkKind, number>()
    counts.set(kind, (counts.get(kind) ?? 0) + 1)
    this.byModel.set(model, counts)
  }

  count(model: string, kind: QuirkKind): number {
    return this.byModel.get(model)?.get(kind) ?? 0
  }

  /** Plain-object view for traces/manifests: model id → kind → count. */
  snapshot(): Record<string, Partial<Record<QuirkKind, number>>> {
    const out: Record<string, Partial<Record<QuirkKind, number>>> = {}
    this.byModel.forEach((counts, model) => {
      const entry: Partial<Record<QuirkKind, number>> = {}
      counts.forEach((count, kind) => {
        entry[kind] = count
      })
      out[model] = entry
    })
    return out
  }
}
