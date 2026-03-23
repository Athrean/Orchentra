export const steps = [
  {
    num: '01',
    title: 'Define the trigger',
    desc: 'Point Orchentra at your GitHub repo. It watches for workflow failures via webhooks — no polling, no cron, no config files.',
  },
  {
    num: '02',
    title: 'Agent investigates',
    desc: 'The AI agent fetches workflow logs, queries Sentry for correlated errors, and searches past incidents. Up to 6 reasoning rounds.',
  },
  {
    num: '03',
    title: 'Approve and act',
    desc: 'A structured brief appears in Slack with root cause, confidence score, and one-click actions. Humans decide, agents execute.',
  },
]

export const features = [
  {
    title: '30-Second Briefs',
    desc: 'From CI failure to root cause brief in your Slack channel. Fetches logs, reasons about the failure, delivers a structured report.',
  },
  {
    title: 'ReAct Agent Loop',
    desc: 'Multi-step reasoning with tool calls. Decides what to investigate, fetches real data, observes results, iterates until confident.',
  },
  {
    title: 'Evidence-Based',
    desc: 'Every conclusion backed by actual log lines and error data. Confidence scores show certainty. No hallucinated fixes.',
  },
  {
    title: 'One-Click Actions',
    desc: 'Approve a fix, dig deeper, snooze, or dismiss — all from Slack buttons. Humans decide, agents execute.',
  },
  {
    title: 'Full Trace Audit',
    desc: 'Every tool call, API response, and reasoning step logged. Complete transparency into what the agent did and why.',
  },
  {
    title: 'Auto Postmortems',
    desc: 'On resolution, the agent drafts a blameless postmortem from gathered evidence. Engineers edit, not write from scratch.',
  },
]

interface IntegrationItem {
  name: string
  live: boolean
}

export const integrations: IntegrationItem[] = [
  { name: 'GitHub Actions', live: true },
  { name: 'Sentry', live: true },
  { name: 'Slack', live: true },
  { name: 'Datadog', live: false },
  { name: 'PagerDuty', live: false },
  { name: 'CircleCI', live: false },
  { name: 'Grafana', live: false },
  { name: 'Linear', live: false },
]

export const identityItems = [
  {
    title: 'An incident response agent.',
    desc: 'Not a dashboard. Not a chatbot. A structured reasoning engine that investigates CI failures end-to-end.',
  },
  {
    title: 'A triage layer.',
    desc: 'Sits between your CI pipeline and your team. Filters noise, surfaces signal, delivers actionable briefs.',
  },
  {
    title: 'An evidence system.',
    desc: 'Every conclusion is backed by log lines, error traces, and historical patterns. Confidence scores, not guesses.',
  },
  {
    title: 'Full observability.',
    desc: 'Every tool call, every API request, every reasoning step — logged, traceable, auditable. Nothing happens in the dark.',
  },
  {
    title: 'A self-hosted runtime.',
    desc: "Your infrastructure, your data, your keys. No vendor lock-in. No external API calls you didn't authorize.",
  },
]

export const problems = [
  {
    without: 'CI fails. An engineer gets paged. Spends 20 minutes reading logs.',
    with: 'CI fails. Orchentra reads the logs, finds the root cause, posts a brief. Engineer reads for 30 seconds.',
  },
  {
    without: 'Sentry errors pile up. Nobody connects them to the failed deploy.',
    with: 'The agent correlates Sentry errors with the CI failure automatically. Pattern matching across tools.',
  },
  {
    without: 'Same failure happens again next week. No one remembers the fix.',
    with: 'Historical pattern matching. The agent recognizes recurring failures and references past resolutions.',
  },
  {
    without: 'Postmortems are a chore. Written days later from memory.',
    with: 'Auto-generated postmortem from gathered evidence. Written immediately. Engineers review, not write.',
  },
]

export const reactSteps = [
  {
    step: 'Observe',
    detail: 'Fetch GitHub Actions logs, parse error output',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-100',
  },
  {
    step: 'Reason',
    detail: '"Error references DATABASE_URL — checking if it\'s set in CI env"',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-100',
  },
  {
    step: 'Act',
    detail: 'Query Sentry for recent errors matching this pattern',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-100',
  },
  {
    step: 'Observe',
    detail: 'Sentry confirms: 12 errors in last hour, same missing env var',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-100',
  },
  {
    step: 'Synthesize',
    detail: 'Root cause identified — confidence 92%. Draft brief.',
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    border: 'border-violet-100',
  },
]

export const auditTraceTools = ['fetch_logs()', 'parse_errors()', 'query_sentry()', 'search_history()', 'synthesize()']

export const openSourceCards = [
  {
    title: 'Extensible',
    desc: 'Add integrations, tools, and custom agents. Every extension is a TypeScript file — no plugin SDK, no marketplace.',
  },
  {
    title: 'Adaptable',
    desc: 'Swap the LLM provider. Change the notification channel. Adjust the reasoning loop. Fork it and make it yours.',
  },
  {
    title: 'Open Source',
    desc: 'MIT licensed. Full source code. No telemetry, no usage tracking, no vendor lock-in. Inspect every line.',
  },
]

export const footerCols = [
  {
    heading: 'Product',
    links: [
      { l: 'Get Started', h: '#setup' },
      { l: 'Features', h: '#features' },
    ],
  },
  {
    heading: 'Platform',
    links: [
      { l: 'Integrations', h: '#integrations' },
      { l: 'How it works', h: '#how-it-works' },
    ],
  },
  {
    heading: 'Developers',
    links: [
      { l: 'Documentation', h: '/docs' },
      { l: 'GitHub', h: 'https://github.com/Athrean/Orchentra' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { l: 'Changelog', h: 'https://github.com/Athrean/Orchentra/releases' },
      { l: 'Contributing', h: 'https://github.com/Athrean/Orchentra' },
      { l: 'License', h: 'https://github.com/Athrean/Orchentra/blob/main/LICENSE' },
    ],
  },
]
