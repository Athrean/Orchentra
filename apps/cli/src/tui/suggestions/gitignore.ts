/**
 * A compact, dependency-free `.gitignore` matcher — just enough of the spec to
 * keep the @-file suggestion walk from surfacing ignored files, without pulling
 * in a full ignore engine. Supports comments, blank lines, bare names matched
 * at any depth, root-anchored patterns (leading or middle slash), directory-only
 * patterns (trailing slash), `*`/`**`/`?` globs, and `!` negation (last match
 * wins). Not a complete implementation — good enough to hide build output.
 */

interface Rule {
  readonly negated: boolean
  readonly dirOnly: boolean
  readonly re: RegExp
}

/** Strip comments and blank lines; return the raw pattern strings in order. */
export function parseGitignore(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
}

/**
 * Compile ignore patterns into a predicate over workspace-relative POSIX paths.
 * `isDir` lets directory-only (`foo/`) patterns match only directories.
 */
export function makeIgnoreMatcher(patterns: readonly string[]): (relPath: string, isDir: boolean) => boolean {
  const rules: Rule[] = []
  for (const pattern of patterns) {
    const rule = compile(pattern)
    if (rule) rules.push(rule)
  }
  return (relPath, isDir) => {
    let ignored = false
    for (const rule of rules) {
      if (rule.dirOnly && !isDir) continue
      if (rule.re.test(relPath)) ignored = !rule.negated
    }
    return ignored
  }
}

function compile(pattern: string): Rule | null {
  let body = pattern
  const negated = body.startsWith('!')
  if (negated) body = body.slice(1)
  const dirOnly = body.endsWith('/')
  if (dirOnly) body = body.slice(0, -1)
  if (body.length === 0) return null

  // A leading or interior slash anchors the pattern to the workspace root;
  // otherwise it may match at any directory level.
  const anchored = body.includes('/')
  if (body.startsWith('/')) body = body.slice(1)

  const source = anchored ? `^${globToRegex(body)}$` : `(^|/)${globToRegex(body)}$`
  return { negated, dirOnly, re: new RegExp(source) }
}

function globToRegex(glob: string): string {
  let out = ''
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        out += '.*'
        i += 1
      } else {
        out += '[^/]*'
      }
    } else if (ch === '?') {
      out += '[^/]'
    } else if ('\\^$.|+()[]{}'.includes(ch)) {
      out += `\\${ch}`
    } else {
      out += ch
    }
  }
  return out
}
