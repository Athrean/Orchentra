export const GITHUB_URL = 'https://github.com/Athrean/Orchentra'
export const README_URL = `${GITHUB_URL}#readme`
export const RELEASES_URL = `${GITHUB_URL}/releases`
export const ISSUES_URL = `${GITHUB_URL}/issues`
export const SECURITY_URL = `${GITHUB_URL}/security`
export const LICENSE_URL = `${GITHUB_URL}/blob/main/LICENSE`
export const PRODUCT_CONTRACT_URL = README_URL
export const INSTALL_COMMAND = 'npm install -g @athreanlab/orchentra'

export const specialists = [
  {
    index: '01',
    role: 'Architect',
    command: '/plan',
    title: 'Turns the repository into a path.',
    body: 'Chooses the narrowest checkable approach, names the real alternatives, and defines what done must prove.',
    image: '/heads/4.png',
    supportRole: 'Explorer',
    supportBody: 'Maps scripts, conventions, constraints, and dirty state without touching the write surface.',
    tags: ['read-only map', 'decision record'],
  },
  {
    index: '02',
    role: 'Senior dev',
    command: '/build',
    title: 'Builds the smallest complete slice.',
    body: 'Works in the repository’s style, keeps the implementation lean, and delegates only genuinely independent work.',
    image: '/heads/5.png',
    supportRole: 'Builder',
    supportBody: 'Owns one vertical slice with the full toolset and a verification obligation attached.',
    tags: ['full tools', 'vertical slice'],
  },
  {
    index: '03',
    role: 'Verifier',
    command: '/review',
    title: 'Lets execution settle the review.',
    body: 'Runs typechecks, tests, builds, repros, and browser flows so confidence cannot outrank evidence.',
    image: '/heads/6.png',
    supportRole: 'Reviewer',
    supportBody: 'Can inspect and execute checks, but cannot edit the answer it is responsible for judging.',
    tags: ['run checks', 'no edits'],
  },
  {
    index: '04',
    role: 'Orchestrator',
    command: 'agent',
    title: 'Keeps parallel work accountable.',
    body: 'Fans out independent tasks while every child inherits the parent’s live token, step, and dollar budget.',
    image: '/heads/1.png',
    supportRole: 'Parallel crew',
    supportBody: 'Coordinates up to four active roles and preserves a durable transcript for every handoff.',
    tags: ['fan-out', 'shared budget'],
  },
] as const

export const reasons = [
  {
    title: 'Repository first',
    body: 'The tree, scripts, instructions, and dirty state are read before a plan becomes an edit.',
    glyph: 'tree',
  },
  {
    title: 'Model aware',
    body: 'Profiles adapt prompts, tool vocabulary, and edit dialects to the model family doing the work.',
    glyph: 'model',
  },
  {
    title: 'Evidence gated',
    body: 'A verifiable task cannot reach done until tests or rendered-product evidence support the claim.',
    glyph: 'gate',
  },
  {
    title: 'Budget inherited',
    body: 'Child agents draw from the parent’s live ceiling, keeping parallelism visible and bounded.',
    glyph: 'budget',
  },
  {
    title: 'Browser native',
    body: 'When the product has a UI, Orchentra can run it, operate it, and preserve what actually happened.',
    glyph: 'browser',
  },
  {
    title: 'Local by design',
    body: 'BYOK, zero application database, no telemetry, and git as the durable handoff.',
    glyph: 'local',
  },
] as const

export const workflow = [
  {
    index: '01',
    title: 'Inspect',
    body: 'Map the repository, reproduce the problem, and establish the checks that can contradict the plan.',
  },
  {
    index: '02',
    title: 'Decide',
    body: 'Choose the smallest complete path, bound the work, and assign independent slices deliberately.',
  },
  {
    index: '03',
    title: 'Execute',
    body: 'Edit in vertical slices, keep every child inside the shared budget, and surface failures immediately.',
  },
  {
    index: '04',
    title: 'Prove',
    body: 'Run the real gate, exercise the rendered product when relevant, and return the evidence chain.',
  },
] as const

export const capabilities = [
  {
    index: '01',
    title: 'Exact traces',
    body: 'Tool results, decisions, spend, compaction, and verification evidence remain reconstructable.',
    visual: 'trace',
  },
  {
    index: '02',
    title: 'Durable context',
    body: 'Long sessions compact live history without rewriting trust-boundary messages or sent prefixes.',
    visual: 'context',
  },
  {
    index: '03',
    title: 'Isolated writers',
    body: 'Parallel builders work in separate worktrees and merge back only through gated, disjoint changes.',
    visual: 'worktree',
  },
  {
    index: '04',
    title: 'Rendered proof',
    body: 'Browser actions, accessibility assertions, console state, and network failures become reviewable evidence.',
    visual: 'browser',
  },
  {
    index: '05',
    title: 'Recovery loops',
    body: 'Classified failures trigger bounded replans instead of optimistic completion or endless retries.',
    visual: 'recovery',
  },
  {
    index: '06',
    title: 'Provider choice',
    body: 'Bring your own keys and use the model family that fits the repository, task, and budget.',
    visual: 'provider',
  },
] as const

export const faqs = [
  {
    question: 'Does Orchentra host my repository?',
    answer: 'No. Orchentra runs from your terminal against your checkout. Git remains the durable handoff.',
  },
  {
    question: 'Does it require an account or database?',
    answer: 'No. The core is bring-your-own-key, uses local sessions, and has no application database.',
  },
  {
    question: 'How does it verify interface work?',
    answer:
      'It can start the app, operate the rendered product in Chromium, and return browser evidence with the test results.',
  },
  {
    question: 'Can agents work in parallel?',
    answer:
      'Yes. Independent builders can use isolated worktrees while sharing the parent task’s live budget and lifecycle.',
  },
  {
    question: 'Does Orchentra collect telemetry?',
    answer: 'No. The public product has no telemetry. Session evidence stays inspectable and local.',
  },
] as const
