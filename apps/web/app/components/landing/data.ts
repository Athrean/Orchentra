export const GITHUB_URL = 'https://github.com/Athrean/Orchentra'
export const README_URL = `${GITHUB_URL}#readme`
export const RELEASES_URL = `${GITHUB_URL}/releases`
export const ISSUES_URL = `${GITHUB_URL}/issues`
export const SECURITY_URL = `${GITHUB_URL}/security`
export const LICENSE_URL = `${GITHUB_URL}/blob/main/LICENSE`
export const INSTALL_COMMAND = 'npm install -g @athreanlab/orchentra'

export const modelProfiles = ['Anthropic', 'OpenAI / Codex', 'Gemini', 'OpenRouter', 'Open-compatible'] as const

export const specialists = [
  {
    index: '01',
    role: 'Architect',
    command: '/plan',
    title: 'Finds the path before files change.',
    body: 'Reads the repository, compares viable approaches, and turns an open-ended request into a checkable plan.',
    image: '/heads/4.png',
    supportRole: 'Explorer',
    supportBody: 'Maps conventions, constraints, scripts, and existing work without widening the write surface.',
    tags: ['read first', 'bound the work'],
  },
  {
    index: '02',
    role: 'Senior developer',
    command: '/build',
    title: 'Owns a complete, testable slice.',
    body: 'Builds in the repository’s style and carries each change through the checks that can disprove it.',
    image: '/heads/5.png',
    supportRole: 'Builder',
    supportBody: 'Takes one independent slice with the tools and context needed to finish it cleanly.',
    tags: ['vertical slice', 'full tools'],
  },
  {
    index: '03',
    role: 'Verifier',
    command: '/review',
    title: 'Tries to break the completion claim.',
    body: 'Runs the code, inspects the rendered product, and reports what the evidence says—not what the edit intended.',
    image: '/heads/6.png',
    supportRole: 'Reviewer',
    supportBody: 'Can inspect and execute checks, but cannot rewrite the answer it is responsible for judging.',
    tags: ['execute checks', 'no edits'],
  },
  {
    index: '04',
    role: 'Orchestrator',
    command: 'agent',
    title: 'Keeps the whole run inside bounds.',
    body: 'Delegates independent work, tracks every child, and closes the run only when the shared contract is met.',
    image: '/heads/1.png',
    supportRole: 'Parallel crew',
    supportBody:
      'Coordinates up to four active roles while preserving the budget, lineage, and result of every handoff.',
    tags: ['shared budget', 'durable trace'],
  },
] as const

export const reasons = [
  {
    question: 'What did the agent actually do?',
    title: 'Read the run, not the recap.',
    body: 'Plans, tool calls, child tasks, edits, test results, and browser evidence stay connected in one inspectable trace.',
  },
  {
    question: 'Who decides when the work is done?',
    title: 'The completion gate does.',
    body: 'A verifiable task remains open until the required checks run and the result matches the product—not the model’s confidence.',
  },
  {
    question: 'How far can parallel work spread?',
    title: 'Only as far as the live budget.',
    body: 'Every child inherits the parent’s token, step, and spend ceilings, so fan-out stays visible and bounded.',
  },
] as const

export const workflow = [
  {
    index: '01',
    command: 'orchentra inspect',
    title: 'Start with the repository as it is.',
    body: 'Orchentra reads instructions, scripts, architecture, and dirty state before it proposes a change.',
  },
  {
    index: '02',
    command: 'orchentra plan',
    title: 'Turn the request into a contract.',
    body: 'The run names the chosen path, its boundaries, and the checks that must pass before implementation begins.',
  },
  {
    index: '03',
    command: 'orchentra run',
    title: 'Delegate work without losing control.',
    body: 'Independent slices can move in parallel while every writer, budget, and handoff remains attached to the parent run.',
  },
  {
    index: '04',
    command: 'orchentra verify',
    title: 'Return proof with the result.',
    body: 'Tests, builds, browser flows, and failure receipts decide whether the run completes or comes back with the blocker.',
  },
] as const

export const runMetrics = [
  {
    label: 'Hosted database',
    value: '0',
    body: 'Local sessions and git remain the durable record.',
  },
  {
    label: 'Active specialist roles',
    value: '4',
    body: 'One coordinated crew, each with explicit authority.',
  },
  {
    label: 'Completion standard',
    value: 'Proof',
    body: 'Checks and rendered evidence outrank a confident answer.',
  },
] as const
