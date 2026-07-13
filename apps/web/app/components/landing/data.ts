export const GITHUB_URL = 'https://github.com/Athrean/Orchentra'
export const README_URL = `${GITHUB_URL}#readme`
export const RELEASES_URL = `${GITHUB_URL}/releases`
export const ISSUES_URL = `${GITHUB_URL}/issues`
export const SECURITY_URL = `${GITHUB_URL}/security`
export const PRODUCT_CONTRACT_URL = `${GITHUB_URL}/blob/main/docs/current/canonical.md`
export const INSTALL_COMMAND = 'npm install -g @orchentra/cli'

export const specialists = [
  {
    index: '01',
    role: 'Architect',
    command: '/plan',
    title: 'Turns a need into a path.',
    body: 'Names the best stack, real alternatives, the smallest scaffold, and the checks that define done.',
    image: '/heads/4.png',
    tone: 'blue',
  },
  {
    index: '02',
    role: 'Senior dev',
    command: '/build',
    title: 'Builds the vertical slice.',
    body: 'Works in the repository’s style, delegates independent work, and keeps every slice inside the live budget.',
    image: '/heads/5.png',
    tone: 'lime',
  },
  {
    index: '03',
    role: 'Verifier',
    command: '/review',
    title: 'Makes the checks decide.',
    body: 'Treats findings as proposals, then runs typechecks, tests, builds, and repros to prove what is real.',
    image: '/heads/6.png',
    tone: 'orange',
  },
  {
    index: '04',
    role: 'Orchestrator',
    command: 'agent',
    title: 'Keeps delegation accountable.',
    body: 'Fans independent work across the crew while every child inherits the parent’s token, step, and dollar budget.',
    image: '/heads/1.png',
    tone: 'navy',
  },
] as const

export const workflow = [
  {
    index: '01',
    title: 'Read',
    body: 'Explorer maps the repository, scripts, conventions, dirty files, and constraints before anything moves.',
  },
  {
    index: '02',
    title: 'Plan',
    body: 'Architect chooses the narrowest checkable path and names the alternatives it rejected.',
  },
  {
    index: '03',
    title: 'Build',
    body: 'Senior dev ships vertical slices and fans independent work out to budget-inheriting builders.',
  },
  {
    index: '04',
    title: 'Verify',
    body: 'Reviewer runs the real project gates. When prose and execution disagree, execution wins.',
  },
] as const

export const spineParts = [
  {
    index: '01',
    title: 'Output discipline',
    body: 'Terse by default. Code, paths, errors, and safety text stay exact while filler disappears.',
  },
  {
    index: '02',
    title: 'Context budget',
    body: 'Tool caps, live-zone compaction, and dollar ceilings keep long sessions useful and spend visible.',
  },
  {
    index: '03',
    title: 'Lean code',
    body: 'YAGNI, stdlib, native capability, existing dependency, one line, then minimum custom code.',
  },
  {
    index: '04',
    title: 'Evidence loop',
    body: 'The crew reports what changed, which command ran, what passed, and what risk remains.',
  },
] as const

export const maturityLevels = [
  {
    level: 'L1',
    title: 'Prompt',
    body: 'One request, one response. Useful, but every task starts cold and judgment lives in the chat.',
  },
  {
    level: 'L3',
    title: 'Agent',
    body: 'Repo tools, saved sessions, skills, hooks, and local memory turn a prompt into a working loop.',
  },
  {
    level: 'L5',
    title: 'Crew',
    body: 'Specialists explore, build, and verify in parallel while sharing the same spine and spend ceiling.',
  },
] as const

export const supportingAgents = [
  {
    index: '01',
    name: 'Explorer',
    body: 'Searches and reads. Reports concrete paths and findings. The write surface is removed.',
    tags: ['read-only', 'repo map'],
    mark: 'E',
    tone: 'navy',
  },
  {
    index: '02',
    name: 'Builder',
    body: 'Implements one delegated slice with the full toolset, lean-code discipline, and a real verification gate.',
    tags: ['full tools', 'vertical slice'],
    mark: 'B',
    tone: 'blue',
  },
  {
    index: '03',
    name: 'Reviewer',
    body: 'Reads and executes checks, but never edits. Its authority comes from command output, not confidence.',
    tags: ['run checks', 'no edits'],
    mark: 'R',
    tone: 'orange',
  },
  {
    index: '04',
    name: 'Parallel crew',
    body: 'Fans independent tasks across up to four active subagents, with every child charged to the parent budget.',
    tags: ['fan-out', 'shared budget'],
    mark: '4',
    tone: 'lime',
  },
] as const
