export const capabilities = [
  {
    name: 'Autonomous Investigation',
    description: 'Full-stack root cause analysis for your most critical CI failures.',
    tags: ['Log analysis', 'Error correlation', 'Pattern matching'],
  },
  {
    name: 'Real-Time Briefs',
    description: 'Structured incident reports delivered to Slack, designed for the way your team works every day.',
    tags: ['Slack integration', 'Confidence scoring', 'Evidence trails'],
  },
  {
    name: 'One-Click Actions',
    description: 'Fastest path from failure to fix — approve, re-run, or escalate without leaving Slack.',
    tags: ['Workflow re-runs', 'Auto postmortems', 'Full audit trail'],
  },
]

export const valueProps = [
  {
    title: 'Break down failures together',
    desc: 'Orchentra reads your CI logs, correlates Sentry errors, and searches past incidents to build a complete picture of what went wrong.',
  },
  {
    title: 'Tackle root causes',
    desc: 'Multi-step ReAct reasoning loop investigates failures end-to-end. Every conclusion backed by real log data and error traces.',
  },
  {
    title: 'Ship fixes faster',
    desc: 'One-click actions from Slack: re-run workflows, create fix PRs, or dig deeper. Humans decide, agents execute.',
  },
]

export const useCases = [
  {
    category: 'CI/CD Triage',
    title: 'Automated failure investigation',
    description:
      'When a GitHub Actions workflow fails, Orchentra kicks in automatically — fetching logs, parsing errors, and delivering a structured root cause brief to your Slack channel in under 30 seconds.',
    detail: {
      heading: 'Incident Brief',
      status: 'CI · deploy-api · my-org/api',
      finding:
        'Missing DATABASE_URL env var in production workflow. Variable was removed in commit abc1234 during secrets rotation.',
      confidence: '92%',
      actions: ['Re-run with fix', 'Create PR', 'Dig deeper'],
    },
  },
  {
    category: 'Error Correlation',
    title: 'Cross-tool pattern matching',
    description:
      'Connect Sentry errors to CI failures automatically. Orchentra queries your error tracker, matches stack traces, and identifies whether a deploy caused the spike — or if it was already there.',
    detail: {
      heading: 'Sentry Correlation',
      status: 'Error · TypeError · my-org/api',
      finding:
        '12 matching errors in production over the last 60 minutes. Same stack trace pattern as CI failure. First seen after deploy #847.',
      confidence: '88%',
      actions: ['View in Sentry', 'Rollback deploy', 'Investigate'],
    },
  },
  {
    category: 'Postmortems',
    title: 'Auto-generated incident reports',
    description:
      'On resolution, Orchentra drafts a blameless postmortem from gathered evidence — timeline, root cause, affected systems, and remediation steps. Engineers review, not write from scratch.',
    detail: {
      heading: 'Postmortem Draft',
      status: 'Resolved · deploy-api · my-org/api',
      finding:
        'Root cause: missing environment variable after secrets rotation. Impact: 23 minutes of failed deploys. Remediation: added env validation step to CI pipeline.',
      confidence: '95%',
      actions: ['Edit draft', 'Publish', 'Add to runbook'],
    },
  },
]

interface IntegrationItem {
  name: string
  live: boolean
  type: 'integration' | 'resource'
}

export const integrations: IntegrationItem[] = [
  { name: 'GitHub Actions', live: true, type: 'integration' },
  { name: 'Sentry', live: true, type: 'integration' },
  { name: 'Slack', live: true, type: 'integration' },
  { name: 'Datadog', live: false, type: 'integration' },
  { name: 'PagerDuty', live: false, type: 'integration' },
  { name: 'CircleCI', live: false, type: 'integration' },
  { name: 'Grafana', live: false, type: 'integration' },
  { name: 'Linear', live: false, type: 'integration' },
]

export const resources = [
  { title: 'Documentation', desc: 'Setup guides and API reference', href: '/docs', tag: 'Docs' },
  {
    title: 'GitHub Repository',
    desc: 'Source code and contributing guide',
    href: 'https://github.com/Athrean/Orchentra',
    tag: 'Open Source',
  },
  {
    title: 'Changelog',
    desc: 'Latest releases and updates',
    href: 'https://github.com/Athrean/Orchentra/releases',
    tag: 'Updates',
  },
  { title: 'Self-Hosting Guide', desc: 'Deploy on your own infrastructure', href: '/docs', tag: 'Docs' },
  {
    title: 'Integration SDK',
    desc: 'Build custom integrations',
    href: 'https://github.com/Athrean/Orchentra',
    tag: 'Developer',
  },
]

export const footerCols = [
  {
    heading: 'Products',
    links: [
      { l: 'Orchentra Agent', h: '#features' },
      { l: 'Dashboard', h: '#demo' },
      { l: 'Integrations', h: '#resources' },
      { l: 'Pricing', h: '#' },
    ],
  },
  {
    heading: 'Solutions',
    links: [
      { l: 'CI/CD Triage', h: '#use-cases' },
      { l: 'Error Correlation', h: '#use-cases' },
      { l: 'Postmortems', h: '#use-cases' },
      { l: 'Incident Response', h: '#' },
    ],
  },
  {
    heading: 'Developers',
    links: [
      { l: 'Documentation', h: '/docs' },
      { l: 'GitHub', h: 'https://github.com/Athrean/Orchentra' },
      { l: 'Contributing', h: 'https://github.com/Athrean/Orchentra' },
      { l: 'Changelog', h: 'https://github.com/Athrean/Orchentra/releases' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { l: 'About', h: '#' },
      { l: 'Blog', h: '#' },
      { l: 'License', h: 'https://github.com/Athrean/Orchentra/blob/main/LICENSE' },
    ],
  },
]
