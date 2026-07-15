// `orchentra regressions` — run the regression suite and gate on it
// (docs/evals/06-REGRESSION-SUITE.md). The runner lives in cli-core; this
// command handles selection, I/O, and the exit code that makes it a gate: a
// previously-passing entry that now fails outright exits non-zero, which is what
// CI blocks on. Quarantined entries never fail the command — they are reported,
// loudly, because a flake that silently disappears is how a regression comes
// back (rule 2).
//
// No model and no credentials: every grader is binary and model-free, so this
// runs identically on a laptop and on a CI box with no API key.

import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  buildRegressionReport,
  loadRegressionEntries,
  runRegressionEntries,
  type RegressionCategory,
  type RegressionEntry,
  type RegressionOutcome,
  type RegressionReport,
  type GradeResult,
} from '@orchentra/cli-core'
import { CLI_VERSION } from '../version'

export interface RunRegressionsArgs {
  suite?: string
  id?: string
  category?: RegressionCategory
  k?: number
  out?: string
  /** Write the markdown summary (quarantine + blockers) for CI / release notes. */
  summary?: string
  /** Print the categories the suite contains and exit — CI uses this to decide
   *  whether it needs a browser engine at all. */
  listCategories?: boolean
  /** Injected grader (tests); defaults to cli-core's real in-place grader. */
  grade?: (entry: RegressionEntry) => Promise<GradeResult>
  stdout?: (text: string) => void
  stderr?: (text: string) => void
}

export async function runRegressionsCommand(args: RunRegressionsArgs): Promise<number> {
  const write = args.stdout ?? ((t: string) => process.stdout.write(t))
  const warn = args.stderr ?? ((t: string) => process.stderr.write(t))

  const suiteDir = resolve(args.suite ?? 'evals/regressions')
  if (!existsSync(suiteDir)) {
    warn(`regressions: suite not found: ${suiteDir}\n`)
    return 1
  }

  const all = loadRegressionEntries(suiteDir)
  if (args.listCategories) {
    const categories = all
      .map((e) => e.meta.category)
      .filter((c, i, all) => all.indexOf(c) === i)
      .sort()
    for (const category of categories) write(`${category}\n`)
    return 0
  }

  const entries = all.filter(
    (e) => (!args.id || e.meta.id === args.id) && (!args.category || e.meta.category === args.category),
  )
  if (entries.length === 0) {
    warn(`regressions: no entries matched under ${suiteDir}\n`)
    return 1
  }

  const outcomes = await runRegressionEntries(entries, { k: args.k, grade: args.grade })
  const report = buildRegressionReport(outcomes, { suite: suiteDir, harness: CLI_VERSION })
  const json = `${JSON.stringify(report, null, 2)}\n`

  if (args.out) {
    const outPath = resolve(args.out)
    await mkdir(dirname(outPath), { recursive: true })
    await writeFile(outPath, json, 'utf8')
    warn(`regressions: report written to ${outPath}\n`)
  } else {
    write(json)
  }

  if (args.summary) {
    const summaryPath = resolve(args.summary)
    await mkdir(dirname(summaryPath), { recursive: true })
    await writeFile(summaryPath, renderMarkdownSummary(report), 'utf8')
    warn(`regressions: summary written to ${summaryPath}\n`)
  }

  warn(renderSummary(outcomes))
  return report.releaseBlocked ? 1 : 0
}

/**
 * Markdown for CI's step summary and for the release notes' "Quarantined
 * regressions this release" line (RELEASE-NOTES-TEMPLATE.md). Rule 2 says
 * quarantine is visible, not silent — so this renders on every run, states
 * "none" explicitly when the list is empty, and always carries the failure
 * signature an entry was quarantined for.
 */
export function renderMarkdownSummary(report: RegressionReport): string {
  const rows = report.entries.map(
    (o) => `| \`${o.id}\` | ${o.passes}/${o.trials} | ${o.observedStatus} | ${o.recordedStatus} |`,
  )
  const lines = [
    `### Regression suite — ${report.entries.length} entries`,
    '',
    '| Entry | Trials | Observed | Recorded |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
  ]

  const quarantined = report.entries.filter((o) => o.quarantined)
  lines.push('**Quarantined regressions this release:**', '')
  if (quarantined.length === 0) {
    lines.push('none', '')
  } else {
    for (const o of quarantined) {
      lines.push(
        `- \`${o.id}\` — ${o.passes}/${o.trials} passed — signature \`${o.failure?.hash ?? 'unknown'}\``,
        ...(o.failure ? ['', '  ```', `  ${o.failure.normalizedLog}`, '  ```'] : []),
      )
    }
    lines.push(
      '',
      'Listed on every release checklist until resolved. A quarantined entry is never deleted to make the suite green (06-REGRESSION-SUITE.md rule 2).',
      '',
    )
  }

  const blockers = report.entries.filter((o) => o.blocker)
  if (blockers.length > 0) {
    lines.push('**`release:blocker` — previously-passing entries that now fail:**', '')
    for (const o of blockers) {
      lines.push(
        `- \`${o.id}\` — was ${o.recordedStatus}, now fails ${o.trials}/${o.trials} — signature \`${o.failure?.hash ?? 'unknown'}\``,
      )
    }
    lines.push('')
  }

  return `${lines.join('\n')}\n`
}

/** Human summary on stderr — stdout stays machine-readable JSON. */
function renderSummary(outcomes: RegressionOutcome[]): string {
  const lines = outcomes.map((o) => `  ${symbol(o)} ${o.id} — ${o.passes}/${o.trials} passed (${o.observedStatus})`)
  const blockers = outcomes.filter((o) => o.blocker)
  const quarantined = outcomes.filter((o) => o.quarantined)

  const out = [`\nregression suite — ${outcomes.length} entries\n`, ...lines.map((l) => `${l}\n`)]
  for (const o of quarantined) {
    out.push(`\nquarantined: ${o.id} — signature ${o.failure?.hash ?? o.id}\n`)
    if (o.failure) out.push(`  ${o.failure.normalizedLog}\n`)
    out.push('  listed on every release checklist until resolved; never delete it to go green.\n')
  }
  for (const o of blockers) {
    out.push(
      `\nrelease:blocker — ${o.id} passed at ${o.recordedStatus} and now fails ${o.trials}/${o.trials} trials.\n`,
    )
    if (o.failure) out.push(`  signature ${o.failure.hash}: ${o.failure.normalizedLog}\n`)
  }
  out.push(
    blockers.length > 0
      ? `\n${blockers.length} release blocker(s): ${blockers.map((o) => o.id).join(', ')}\n`
      : '\nno release blockers.\n',
  )
  return out.join('')
}

function symbol(o: RegressionOutcome): string {
  if (o.blocker) return 'x'
  if (o.quarantined) return '!'
  return '+'
}
