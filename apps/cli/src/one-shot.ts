import type { TurnRunResult } from './live-cli'

export interface OneShotCli {
  runTurn(input: string, options?: { verify?: boolean }): Promise<TurnRunResult>
}

/**
 * Run a single prompt and map the turn outcome to a process exit code.
 * A turn that ends for any reason other than a clean stop (provider error,
 * budget exhaustion, abort) exits non-zero so scripts can trust the result.
 */
export async function runOneShot(cli: OneShotCli, prompt: string, close: () => Promise<void>): Promise<number> {
  try {
    // One-shot is automation. Its zero exit means the completion gate passed,
    // never merely that the model returned `end_turn`.
    const result = await cli.runTurn(prompt, { verify: true })
    return result.ok ? 0 : 1
  } finally {
    await close()
  }
}
