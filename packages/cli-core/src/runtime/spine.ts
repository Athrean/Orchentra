import { terseModePrompt, type TerseMode } from './terse'

export interface SpineBudgetControls {
  maxCostUsd?: number
  warnCostUsd?: number
  toolOutputBudgetChars: number
  compactionThreshold: number
  keepRecentOnCompact: number
}

export interface SpinePromptOptions {
  terseMode?: TerseMode
  budget?: Partial<SpineBudgetControls>
  taskFocus?: string
}

export function spinePrompt(opts: SpinePromptOptions = {}): string {
  const parts = [
    'ORCHENTRA SPINE:',
    '- Output discipline: concise, no filler. Never shorten code, commands, paths, URLs, errors, security warnings, approval prompts, or destructive-action confirmations.',
    '- Context budget: use focused reads, bounded tool output, and live-zone compaction. Preserve recoverability; report measured savings only.',
    '- Lean code: apply YAGNI -> stdlib -> native platform -> existing dependency -> one line -> minimum custom code. Change only what the task needs.',
  ]
  const budget = budgetLine(opts.budget)
  if (budget) parts.push(`- Active budget controls: ${budget}.`)
  if (opts.taskFocus) parts.push(`- Task focus: ${opts.taskFocus}.`)

  const terse = opts.terseMode ? terseModePrompt(opts.terseMode) : ''
  return [parts.join('\n'), terse].filter(Boolean).join('\n\n')
}

function budgetLine(budget: Partial<SpineBudgetControls> | undefined): string | null {
  if (!budget) return null
  const fields: string[] = []
  if (budget.warnCostUsd !== undefined) fields.push(`warn=$${budget.warnCostUsd}`)
  if (budget.maxCostUsd !== undefined) fields.push(`cap=$${budget.maxCostUsd}`)
  if (budget.toolOutputBudgetChars !== undefined) fields.push(`tool_output=${budget.toolOutputBudgetChars} chars`)
  if (budget.compactionThreshold !== undefined)
    fields.push(`compact_at=${Math.round(budget.compactionThreshold * 100)}%`)
  if (budget.keepRecentOnCompact !== undefined) fields.push(`keep_recent=${budget.keepRecentOnCompact}`)
  return fields.length === 0 ? null : fields.join(', ')
}
