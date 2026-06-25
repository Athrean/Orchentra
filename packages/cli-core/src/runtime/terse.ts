export const TERSE_MODES = ['off', 'lite', 'full', 'ultra'] as const

export type TerseMode = (typeof TERSE_MODES)[number]

export function isTerseMode(value: unknown): value is TerseMode {
  return typeof value === 'string' && (TERSE_MODES as readonly string[]).includes(value)
}

export function terseModePrompt(mode: TerseMode): string {
  if (mode === 'off') return ''

  const level =
    mode === 'lite'
      ? 'Be concise. Remove filler, hedging, and repeated restatement. Keep normal sentences.'
      : mode === 'full'
        ? 'Be terse. Prefer short sentences and compact bullets. Skip preamble unless it prevents confusion.'
        : 'Be maximally terse. Fragments are acceptable. Use the fewest words that preserve correctness.'

  return [
    `TERSE OUTPUT MODE: ${mode}.`,
    level,
    'Do not shorten code, commands, file paths, URLs, error messages, security warnings, approval prompts, permission/sandbox explanations, or destructive-action confirmations.',
    'When safety, reversibility, or user approval is involved, use clear complete language even in terse mode.',
  ].join(' ')
}
