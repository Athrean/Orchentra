import type { CommandContext, CommandHandler } from '../registry'
import type { UiKVRow } from '../ui-output'

/**
 * Outcome of a prereq probe. When `ok` is false, `rows` describe what's
 * missing in `/status`-style key/value form so the middleware can render
 * a tabular card instead of letting an unboxed error bubble up.
 */
export type PrereqCheckResult = { readonly ok: true } | { readonly ok: false; readonly rows: readonly UiKVRow[] }

export interface PrereqCheck {
  check(ctx: CommandContext): Promise<PrereqCheckResult>
}

/**
 * Wrap a command handler with a prereq probe. Used by `/incident` to replace
 * the raw `Missing Orchentra config` stack trace with a tabular menu. The
 * wrapped handler is invoked only when the probe returns `ok: true`.
 *
 * Scope note: this middleware is applied to `/incident` only. The rest of
 * the server-bridge commands (`/retry`, `/explain`) keep their current
 * raw-streaming behaviour.
 */
export function withIncidentPrereq(inner: CommandHandler, deps: PrereqCheck): CommandHandler {
  return {
    spec: inner.spec,
    async execute(args: string[], ctx: CommandContext): Promise<boolean> {
      const result = await deps.check(ctx)
      if (result.ok) return inner.execute(args, ctx)

      if (ctx.ui) {
        ctx.ui({
          kind: 'card',
          title: 'Incident — prereqs missing',
          sections: [{ rows: result.rows }],
        })
        return true
      }

      // Plaintext fallback for one-shot CLI surfaces.
      const lines: string[] = ['Incident — prereqs missing']
      const width = Math.max(...result.rows.map((r) => r.key.length))
      for (const row of result.rows) {
        lines.push(`  ${row.key.padEnd(width)}  ${row.value}`)
      }
      process.stdout.write(lines.join('\n') + '\n')
      return true
    },
  }
}
