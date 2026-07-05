export interface ToolOutputBudgetResult {
  /** What to send to the provider — trimmed when over budget, else the original. */
  content: string
  trimmed: boolean
  originalChars: number
  keptChars: number
}

// Cap an oversized tool result before it enters the provider-bound message so a
// huge output doesn't burn input tokens every later turn. Keeps head + tail
// (errors/summaries cluster at the ends) with a visible marker; the full result
// still flows to the display + session log, so nothing is lost.
//
// Char budget is a ~chars/4 token proxy — swap in a real tokenizer only if
// attribution accuracy ever matters more than the zero-dep simplicity.
export function budgetToolOutput(content: string, maxChars: number, recoveryPath?: string): ToolOutputBudgetResult {
  const originalChars = content.length
  if (maxChars <= 0 || originalChars <= maxChars) {
    return { content, trimmed: false, originalChars, keptChars: originalChars }
  }
  const dropped = originalChars - maxChars
  const headChars = Math.ceil(maxChars / 2)
  const tailChars = maxChars - headChars
  const marker = recoveryPath
    ? `\n… [${dropped} chars trimmed by tool-output budget — next_step: read ${recoveryPath} for the full result] …\n`
    : `\n… [${dropped} chars trimmed by tool-output budget — full result in session log] …\n`
  return {
    content: content.slice(0, headChars) + marker + content.slice(originalChars - tailChars),
    trimmed: true,
    originalChars,
    keptChars: maxChars,
  }
}
