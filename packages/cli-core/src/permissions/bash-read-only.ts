/**
 * Tighter "is this bash command safe to auto-allow without prompting" check.
 *
 * Deliberately stricter than the read-only-mode gate in cli-tools'
 * bash-validation: runners like `git`, `cargo`, `python`, `node` whose second
 * token can mutate state are excluded here, because a looser predicate is
 * only appropriate for users who explicitly opted into read-only mode — NOT
 * for unconditional auto-allow.
 *
 * Rule: first token must be in PURE_READ. For `git`/`gh` the second token
 * must be in the per-tool sub-verb whitelist. Output redirects and in-place
 * editing always require a prompt.
 */
const PURE_READ = new Set([
  'cat',
  'head',
  'tail',
  'less',
  'more',
  'wc',
  'ls',
  'find',
  'grep',
  'rg',
  'awk',
  'sed',
  'echo',
  'printf',
  'which',
  'where',
  'whoami',
  'pwd',
  'env',
  'printenv',
  'date',
  'cal',
  'df',
  'du',
  'free',
  'uptime',
  'uname',
  'file',
  'stat',
  'diff',
  'sort',
  'uniq',
  'tr',
  'cut',
  'paste',
  'tee',
  'test',
  'true',
  'false',
  'type',
  'readlink',
  'realpath',
  'basename',
  'dirname',
  'sha256sum',
  'md5sum',
  'b3sum',
  'xxd',
  'hexdump',
  'od',
  'strings',
  'tree',
  'jq',
  'yq',
])

const GIT_READ_SUBCOMMANDS = new Set([
  'status',
  'log',
  'diff',
  'show',
  'branch',
  'tag',
  'remote',
  'fetch',
  'ls-files',
  'ls-tree',
  'cat-file',
  'rev-parse',
  'describe',
  'shortlog',
  'blame',
  'reflog',
  'config',
])

const GH_READ_SUBCOMMANDS = new Set(['issue', 'pr', 'repo', 'release', 'workflow', 'run', 'api', 'auth', 'browse'])

const GH_READ_VERBS_FOR_SUBCOMMAND: Record<string, ReadonlySet<string>> = {
  issue: new Set(['list', 'view', 'status']),
  pr: new Set(['list', 'view', 'status', 'checks', 'diff']),
  repo: new Set(['list', 'view']),
  release: new Set(['list', 'view']),
  workflow: new Set(['list', 'view']),
  run: new Set(['list', 'view', 'watch']),
  api: new Set(['']),
  auth: new Set(['status']),
  browse: new Set(['']),
}

export function isBashReadOnly(command: string): boolean {
  if (hasUnsafeFragment(command)) return false
  const tokens = command.trim().split(/\s+/)
  const head = tokens[0]?.split('/').pop() ?? ''
  if (!head) return false
  if (head === 'git') {
    const sub = tokens[1] ?? ''
    return GIT_READ_SUBCOMMANDS.has(sub)
  }
  if (head === 'gh') {
    const sub = tokens[1] ?? ''
    if (!GH_READ_SUBCOMMANDS.has(sub)) return false
    const allowedVerbs = GH_READ_VERBS_FOR_SUBCOMMAND[sub]
    if (!allowedVerbs) return false
    const verb = tokens[2] ?? ''
    return allowedVerbs.has(verb)
  }
  return PURE_READ.has(head)
}

function hasUnsafeFragment(command: string): boolean {
  if (command.includes(' > ') || command.includes(' >> ')) return true
  if (command.includes(' >&') || command.includes(' |&')) return true
  if (command.includes('-i ') || command.includes('--in-place')) return true
  return false
}
