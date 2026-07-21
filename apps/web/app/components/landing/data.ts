export const GITHUB_URL = 'https://github.com/Athrean/Orchentra'
export const README_URL = `${GITHUB_URL}#readme`
export const RELEASES_URL = `${GITHUB_URL}/releases`
export const ISSUES_URL = `${GITHUB_URL}/issues`
export const SECURITY_URL = `${GITHUB_URL}/security`
export const LICENSE_URL = `${GITHUB_URL}/blob/main/LICENSE`
export const INSTALL_COMMAND = 'npm install -g @athreanlab/orchentra'

export const referenceEase = [0.12, 0.23, 0.17, 0.99] as const

export const comparison = {
  without: [
    'One general-purpose agent owns every decision',
    'Subtasks lose budget, lineage, and run context',
    'Exit codes are mistaken for product correctness',
    'Browser verification is optional or manual',
    'Long runs collapse into an uncheckable recap',
    'Parallel work can spread beyond its real limits',
  ],
  with: [
    'Specialist roles with explicit authority',
    'Shared budgets and durable child transcripts',
    'Tests, builds, and browser evidence gate completion',
    'Real browser operation with deterministic waits',
    'Linked traces preserve the complete evidence chain',
    'Local-first, BYOK, zero database, no telemetry',
  ],
} as const

export const capabilities = [
  {
    icon: 'flow',
    title: 'Unified Harness',
    body: 'Keep planning, edits, delegated work, checks, browser state, and the final completion decision in one accountable run.',
  },
  {
    icon: 'model',
    title: 'Model Profiles',
    body: 'Adapt prompt structure, edit dialect, tool vocabulary, and continuation behavior to the model family doing the work.',
  },
  {
    icon: 'context',
    title: 'Context Engine',
    body: 'Preserve trust-boundary messages and live evidence while compacting only the context that is safe to replace.',
  },
  {
    icon: 'browser',
    title: 'Browser Verification',
    body: 'Start the application, operate the rendered product, and surface console or network failures from a real Chromium session.',
  },
  {
    icon: 'gate',
    title: 'Completion Gates',
    body: 'Keep verifiable work open until its declared checks run and the evidence supports the completion claim.',
  },
  {
    icon: 'agents',
    title: 'Sub-Agent Runtime',
    body: 'Fan out bounded, independent work while retaining shared budgets, role restrictions, durable state, and parent-child traces.',
  },
] as const

export const setupSteps = [
  {
    index: '01',
    short: '1. Install',
    title: 'Install The Harness',
    body: 'Add Orchentra globally, open the repository you want to change, and bring the provider credentials you already control.',
  },
  {
    index: '02',
    short: '2. Describe',
    title: 'Describe The Outcome',
    body: 'State the result you need. Orchentra reads repository instructions, dirty state, scripts, and architecture before work begins.',
  },
  {
    index: '03',
    short: '3. Verify',
    title: 'Run Until Proven',
    body: 'The harness plans, delegates, edits, executes checks, operates the browser when relevant, and returns the evidence chain.',
  },
] as const

export const lifecycle = [
  {
    id: 'inspect',
    label: 'Inspect',
    icon: 'folder',
    title: 'Start With The Repository',
    body: 'Load instructions, scripts, architecture, worktree state, and existing conventions before deciding what the task requires.',
  },
  {
    id: 'plan',
    label: 'Plan',
    icon: 'plan',
    title: 'Turn Intent Into A Contract',
    body: 'Choose a bounded path, name the files and behaviors in scope, and declare the checks that can disprove completion.',
  },
  {
    id: 'build',
    label: 'Build',
    icon: 'build',
    title: 'Coordinate The Right Crew',
    body: 'Give independent slices to constrained specialists while the parent run retains the budget, authority, and merge contract.',
  },
  {
    id: 'verify',
    label: 'Verify',
    icon: 'verify',
    title: 'Close With Evidence',
    body: 'Run the real checks, exercise rendered behavior, inspect failures, and complete only when the evidence matches the request.',
  },
] as const

export const plans = [
  {
    name: 'Open Source',
    audience: 'For developers and teams running locally',
    price: '$0',
    suffix: 'forever',
    body: 'The complete local coding harness. Bring your own provider keys and keep the control plane in your checkout.',
    features: [
      ['Model-aware runtime', true],
      ['Browser verification', true],
      ['Evidence-gated completion', true],
      ['Specialist sub-agents', true],
      ['Local traces and sessions', true],
      ['Hosted workspace', false],
      ['Managed provider credits', false],
    ],
    cta: 'Install Orchentra',
    href: '#install',
    popular: false,
  },
  {
    name: 'Teams',
    audience: 'For organizations standardizing trusted runs',
    price: 'Soon',
    suffix: 'on the roadmap',
    body: 'A future collaboration layer for teams that need shared policy and review without weakening the local-first core.',
    features: [
      ['Everything in open source', true],
      ['Shared completion policies', true],
      ['Team evidence review', true],
      ['Organization controls', true],
      ['Managed collaboration', true],
      ['Product telemetry', false],
      ['Closed provider lock-in', false],
    ],
    cta: 'Follow Releases',
    href: RELEASES_URL,
    popular: true,
  },
] as const

export const principles = [
  {
    quote: 'A passing edit is not a finished product. The rendered behavior gets a vote.',
    title: 'Browser evidence',
    role: 'Verification contract',
  },
  {
    quote: 'Every specialist receives only the tools and authority required by its role.',
    title: 'Constrained delegation',
    role: 'Sub-agent contract',
  },
  {
    quote: 'The final answer points back to checks and artifacts instead of asking for trust.',
    title: 'Inspectable proof',
    role: 'Trace contract',
  },
  {
    quote: 'Children draw from the parent run. Parallel work never invents a hidden budget.',
    title: 'Shared ceilings',
    role: 'Budget contract',
  },
  {
    quote: 'Provider choice changes execution strategy without changing the completion standard.',
    title: 'Model awareness',
    role: 'Runtime contract',
  },
  {
    quote: 'Sessions, traces, credentials, and the working repository remain under local control.',
    title: 'Local ownership',
    role: 'Product contract',
  },
] as const

export const faq = [
  {
    question: 'What is Orchentra?',
    answer:
      'Orchentra is a model-aware coding harness that coordinates specialist agents, runs the real checks, operates the rendered product when relevant, and preserves the evidence behind completion.',
  },
  {
    question: 'Who is Orchentra built for?',
    answer:
      'It is built for developers and engineering teams who already use coding models but need stronger control over delegation, long-running work, verification, and auditability.',
  },
  {
    question: 'Does Orchentra replace Claude Code or Codex?',
    answer:
      'No. Orchentra is the harness around model providers and coding workflows. It makes execution model-aware while keeping a consistent completion and evidence contract.',
  },
  {
    question: 'Can I use my existing model providers?',
    answer:
      'Yes. The CLI is BYOK and supports provider-specific profiles so you can use the credentials and model access you already control.',
  },
  {
    question: 'Does my work stay local?',
    answer:
      'Yes. The core product is CLI-first and zero-database. Repository state, sessions, traces, and the control plane stay local, and the product includes no telemetry.',
  },
  {
    question: 'How does Orchentra decide a task is finished?',
    answer:
      'Verifiable work stays open until its completion policy has the required evidence: tests, builds, browser assertions, or classified failure receipts tied to the run trace.',
  },
] as const
