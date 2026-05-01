/**
 * Destructive command patterns enforced before any other permission check.
 * Mirrors the substring-and-first-token rules in
 * `packages/cli-tools/src/bash-validation.ts`. Duplicated here to avoid a
 * cli-core → cli-tools dependency cycle.
 */
export const DESTRUCTIVE_PATTERNS: readonly (readonly [string, string])[] = [
  ['rm -rf /', 'recursive forced deletion at root'],
  ['rm -rf ~', 'recursive forced deletion of home directory'],
  ['rm -rf *', 'recursive forced deletion of all files in cwd'],
  ['rm -rf .', 'recursive forced deletion of current directory'],
  ['mkfs', 'filesystem creation will destroy existing data'],
  ['dd if=', 'direct disk write — can overwrite partitions'],
  ['> /dev/sd', 'writing to a raw disk device'],
  ['chmod -R 777', 'recursive world-writable permissions'],
  ['chmod -R 000', 'recursive permission removal'],
  [':(){ :|:& };:', 'fork bomb'],
  ['git push --force', 'force-push can rewrite shared history'],
  ['git push -f', 'force-push can rewrite shared history'],
  ['git reset --hard', 'discards all local changes irreversibly'],
] as const

export const ALWAYS_DESTRUCTIVE_COMMANDS = ['shred', 'wipefs'] as const

export interface DestructiveMatch {
  readonly name: string
  readonly reason: string
}

export function detectDestructive(command: string): DestructiveMatch | null {
  for (const [pattern, reason] of DESTRUCTIVE_PATTERNS) {
    if (command.includes(pattern)) return { name: pattern, reason }
  }
  const first = command.trim().split(/\s+/)[0]?.split('/').pop() ?? ''
  for (const cmd of ALWAYS_DESTRUCTIVE_COMMANDS) {
    if (first === cmd) return { name: cmd, reason: `'${cmd}' is inherently destructive` }
  }
  if (command.includes('rm ') && /\s-[a-zA-Z]*r/.test(command) && /\s-[a-zA-Z]*f/.test(command)) {
    return { name: 'rm -rf', reason: 'recursive forced deletion' }
  }
  return null
}
