import type { UsageTotals } from '@orchentra/cli-core'
import { formatUsd, pricingForModel } from '@orchentra/cli-core'
import { previewToolResult } from './tui/components/tool-preview'

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const CYAN = '\x1b[36m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const BOLD = '\x1b[1m'

export class Spinner {
  private frame = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly stream: NodeJS.WritableStream

  constructor(stream?: NodeJS.WritableStream) {
    this.stream = stream ?? process.stderr
  }

  start(label: string): void {
    this.stop()
    this.timer = setInterval(() => {
      this.stream.write(`\r${DIM}${SPINNER_FRAMES[this.frame]} ${label}${RESET}`)
      this.frame = (this.frame + 1) % SPINNER_FRAMES.length
    }, 80)
  }

  stop(finalLabel?: string): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.stream.write('\r\x1b[K')
    if (finalLabel) {
      this.stream.write(`${finalLabel}\n`)
    }
  }
}

export function renderToolCall(name: string, input: unknown): string {
  const args = typeof input === 'string' ? input : JSON.stringify(input)
  const preview = args.length > 120 ? args.slice(0, 120) + '…' : args
  return `${DIM}  → ${CYAN}${name}${RESET} ${DIM}${preview}${RESET}`
}

export function renderToolResult(content: string, isError: boolean): string {
  const color = isError ? YELLOW : DIM
  const result = previewToolResult(content, { maxLines: 3, maxChars: 240 })
  const body = result.lines.map((line, i) => `${color}  ${i === 0 ? '←' : ' '} ${line}${RESET}`).join('\n')
  if (!result.truncated) return body
  return `${body}\n${DIM}     … +${result.hiddenLines} line${result.hiddenLines === 1 ? '' : 's'} (truncated)${RESET}`
}

export function renderUsageSummary(usage: UsageTotals, model?: string): string {
  const parts: string[] = []
  parts.push(`tokens: ${usage.inputTokens}in/${usage.outputTokens}out`)
  if (usage.cacheReadTokens > 0) {
    parts.push(`cache: ${usage.cacheReadTokens}read`)
  }

  if (model) {
    const pricing = pricingForModel(model)
    if (pricing) {
      const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputCostPerMillion
      const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputCostPerMillion
      parts.push(`cost: ${formatUsd(inputCost + outputCost)}`)
    }
  }

  return `${DIM}${parts.join(' | ')}${RESET}`
}

export function renderDoneLine(steps: number, usage: UsageTotals, model?: string): string {
  const usageLine = renderUsageSummary(usage, model)
  return `${GREEN}${BOLD}Done${RESET} (${steps} steps) ${usageLine}`
}

export function renderErrorLine(message: string): string {
  return `${YELLOW}Error: ${message}${RESET}`
}

export function renderCompactNotice(dropped: number, saved: number): string {
  return `${DIM}Context compacted: ${dropped} messages dropped, ~${saved} tokens saved${RESET}`
}
