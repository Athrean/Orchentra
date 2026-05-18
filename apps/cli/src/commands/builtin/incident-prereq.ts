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
 * Slice 5: optional hook that lets the prereq middleware offer the user
 * `Bootstrap now? [Y/n]` before falling back to the tabular menu. Both
 * sides of the hook are injected so tests don't touch stdin or the
 * network. The hook only fires when the probe failed AND `ctx.ui` is
 * present (the offer would be confusing without a TUI surface).
 */
export interface IncidentBootstrapHook {
  promptBootstrap(ctx: CommandContext): Promise<boolean>
  runBootstrap(ctx: CommandContext): Promise<void>
}

/**
 * Wrap a command handler with a prereq probe. Used by `/incident` to replace
 * the raw `Missing Orchentra config` stack trace with a tabular menu. The
 * wrapped handler is invoked only when the probe returns `ok: true`.
 *
 * When a `bootstrap` hook is supplied AND the probe fails AND `ctx.ui` is
 * present, the middleware first offers to run the install bootstrap
 * orchestrator. On Y → orchestrator → re-check; if the second check
 * passes, the wrapped handler runs immediately. On n (or no hook), the
 * legacy tabular menu renders.
 *
 * Scope note: this middleware is applied to `/incident` only. The rest of
 * the server-bridge commands (`/retry`, `/explain`) keep their current
 * raw-streaming behaviour.
 */
export function withIncidentPrereq(
  inner: CommandHandler,
  deps: PrereqCheck,
  bootstrap?: IncidentBootstrapHook,
): CommandHandler {
  return {
    spec: inner.spec,
    async execute(args: string[], ctx: CommandContext): Promise<boolean> {
      const first = await deps.check(ctx)
      if (first.ok) return inner.execute(args, ctx)

      // Bootstrap offer is gated on (a) a ui sink (we won't surface a Y/n
      // prompt over plaintext fallback) and (b) a hook being injected.
      if (ctx.ui && bootstrap) {
        const wantsBootstrap = await bootstrap.promptBootstrap(ctx)
        if (wantsBootstrap) {
          await bootstrap.runBootstrap(ctx)
          const second = await deps.check(ctx)
          if (second.ok) return inner.execute(args, ctx)
          return renderMissingCard(second.rows, ctx)
        }
      }

      return renderMissingCard(first.rows, ctx)
    },
  }
}

function renderMissingCard(rows: readonly UiKVRow[], ctx: CommandContext): boolean {
  if (ctx.ui) {
    ctx.ui({
      kind: 'card',
      title: 'Incident — prereqs missing',
      sections: [{ rows }],
    })
    return true
  }

  // Plaintext fallback for one-shot CLI surfaces.
  const lines: string[] = ['Incident — prereqs missing']
  const width = Math.max(...rows.map((r) => r.key.length))
  for (const row of rows) {
    lines.push(`  ${row.key.padEnd(width)}  ${row.value}`)
  }
  process.stdout.write(lines.join('\n') + '\n')
  return true
}
