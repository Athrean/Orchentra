export interface ClassifiedCommand {
  /** Verb token after stripping env-var prefix and any path. Empty if input has no verb. */
  readonly verb: string
  /** Sub-verb for known multi-verb tools (git, gh, npm, pnpm, cargo, docker). */
  readonly subverb?: string
  /** Tokens beginning with `-` (after the verb / subverb). Long-with-`=` kept as one token; `--key value` kept as two. */
  readonly flags: readonly string[]
  /** Positional tokens (everything else after the verb / subverb). */
  readonly args: readonly string[]
}

const SUBVERB_TOOLS = new Set(['git', 'gh', 'npm', 'pnpm', 'cargo', 'docker'])

/**
 * Tokenize a single Bash command string into verb / subverb / flags / args.
 *
 * Scope: a single command. Pipes (`|`), conjunctions (`&&`/`||`), and
 * background (`&`) are not split here — that is the policy layer's job.
 * Redirects (`>`, `>>`, etc.) and their targets are kept as positional args
 * so a policy can match on them; the legacy bash-validation layer is
 * responsible for blocking unsafe redirects.
 */
/**
 * Strip env-var assignments and the leading path on the verb, returning
 * the remaining tokens joined by single spaces. Used by the policy engine
 * for raw glob matching against the rendered command form.
 */
export function commandTail(input: string): string {
  const tokens = tokenize(input)
  let i = 0
  while (i < tokens.length && isEnvAssignment(tokens[i]!)) i += 1
  if (i >= tokens.length) return ''
  const verb = tokens[i]!.split('/').pop() ?? ''
  return [verb, ...tokens.slice(i + 1)].join(' ')
}

export function classify(input: string): ClassifiedCommand {
  const tokens = tokenize(input)
  let i = 0
  while (i < tokens.length && isEnvAssignment(tokens[i]!)) i += 1

  const verbToken = tokens[i]
  if (verbToken === undefined) return { verb: '', flags: [], args: [] }
  const verb = verbToken.split('/').pop() ?? ''
  i += 1

  let subverb: string | undefined
  const next = tokens[i]
  if (next !== undefined && SUBVERB_TOOLS.has(verb) && !next.startsWith('-')) {
    subverb = next
    i += 1
  }

  const flags: string[] = []
  const args: string[] = []
  for (; i < tokens.length; i += 1) {
    const t = tokens[i]!
    if (t.startsWith('--')) {
      flags.push(t)
      if (!t.includes('=') && i + 1 < tokens.length && !tokens[i + 1]!.startsWith('-')) {
        flags.push(tokens[i + 1]!)
        i += 1
      }
    } else if (t.startsWith('-') && t.length > 1) {
      flags.push(t)
    } else {
      args.push(t)
    }
  }

  return subverb === undefined ? { verb, flags, args } : { verb, subverb, flags, args }
}

const ENV_RE = /^[A-Za-z_][A-Za-z0-9_]*=/

function isEnvAssignment(token: string): boolean {
  return ENV_RE.test(token)
}

/**
 * Shell-aware tokenizer. Handles single quotes (literal), double quotes
 * (with `\\`, `\"`, `\$`, `\\` escapes), and backslash-escapes outside
 * quotes. Anything else is whitespace-separated.
 */
function tokenize(input: string): string[] {
  const out: string[] = []
  let cur = ''
  let inSingle = false
  let inDouble = false
  let started = false

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]!
    if (inSingle) {
      if (ch === "'") {
        inSingle = false
      } else {
        cur += ch
      }
      continue
    }
    if (inDouble) {
      if (ch === '\\' && i + 1 < input.length) {
        const nx = input[i + 1]!
        if (nx === '"' || nx === '\\' || nx === '$' || nx === '`') {
          cur += nx
          i += 1
          continue
        }
        cur += ch
        continue
      }
      if (ch === '"') {
        inDouble = false
      } else {
        cur += ch
      }
      continue
    }
    if (ch === "'") {
      inSingle = true
      started = true
      continue
    }
    if (ch === '"') {
      inDouble = true
      started = true
      continue
    }
    if (ch === '\\' && i + 1 < input.length) {
      cur += input[i + 1]!
      i += 1
      started = true
      continue
    }
    if (/\s/.test(ch)) {
      if (started) {
        out.push(cur)
        cur = ''
        started = false
      }
      continue
    }
    cur += ch
    started = true
  }
  if (started) out.push(cur)
  return out
}
