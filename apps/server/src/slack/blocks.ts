import type { IncidentBrief } from '@orchentra/core'

// Slack Block Kit types (subset we use)
interface TextObject {
  type: 'plain_text' | 'mrkdwn'
  text: string
  emoji?: boolean
}

interface HeaderBlock {
  type: 'header'
  text: TextObject
}

interface SectionBlock {
  type: 'section'
  text?: TextObject
  fields?: TextObject[]
  accessory?: ButtonElement | OverflowElement
}

interface DividerBlock {
  type: 'divider'
}

interface ContextBlock {
  type: 'context'
  elements: TextObject[]
}

interface ButtonElement {
  type: 'button'
  text: TextObject
  action_id: string
  value?: string
  url?: string
  style?: 'primary' | 'danger'
}

interface OverflowElement {
  type: 'overflow'
  action_id: string
  options: { text: TextObject; value: string }[]
}

interface ActionsBlock {
  type: 'actions'
  elements: (ButtonElement | OverflowElement)[]
}

export type SlackBlock = HeaderBlock | SectionBlock | DividerBlock | ContextBlock | ActionsBlock

interface IncidentContext {
  id: string
  repo: string
  branch: string
  commit: string
  workflowName: string
  workflowRunId: number | null
}

function dashboardUrl(repo: string, incidentId: string): string {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
  return `${frontendUrl}/dashboard/${encodeURIComponent(repo)}?incident=${incidentId}`
}

function confidenceBadge(confidence: number): string {
  const pct = Math.round(confidence * 100)
  if (pct >= 80) return `🟢 ${pct}%`
  if (pct >= 50) return `🟡 ${pct}%`
  return `🔴 ${pct}%`
}

// ──────────────────────────────────────────────
// 1. Investigating — posted when webhook arrives
// ──────────────────────────────────────────────

export function investigatingBlocks(incident: IncidentContext): SlackBlock[] {
  const link = dashboardUrl(incident.repo, incident.id)
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: `🔍 CI Failure — ${incident.repo}`, emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Workflow:*\n${incident.workflowName}` },
        { type: 'mrkdwn', text: `*Branch:*\n\`${incident.branch}\`` },
        { type: 'mrkdwn', text: `*Commit:*\n\`${incident.commit.slice(0, 7)}\`` },
        { type: 'mrkdwn', text: `*Status:*\n⏳ Investigating...` },
      ],
    },
    { type: 'divider' },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `<${link}|View in Dashboard →>` }],
    },
  ]
}

export function investigatingFallback(incident: IncidentContext): string {
  return `🔍 CI Failure in ${incident.repo} — ${incident.workflowName} on ${incident.branch}. Investigating...`
}

// ──────────────────────────────────────────────
// 2. Brief Ready — after agent synthesizes brief
// ──────────────────────────────────────────────

export function briefReadyBlocks(incident: IncidentContext, brief: IncidentBrief): SlackBlock[] {
  const link = dashboardUrl(incident.repo, incident.id)
  const badge = confidenceBadge(brief.confidence)
  const failureLabel = brief.failureType.replace(/_/g, ' ')

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `⚠️ CI Failure — ${incident.repo}`, emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Workflow:*\n${incident.workflowName}` },
        { type: 'mrkdwn', text: `*Branch:*\n\`${incident.branch}\`` },
        { type: 'mrkdwn', text: `*Type:*\n${failureLabel}` },
        { type: 'mrkdwn', text: `*Confidence:*\n${badge}` },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Root Cause:*\n${brief.rootCause}` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Suggested Fix:*\n${brief.suggestedFix}` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `> ${brief.summary}` },
    },
    { type: 'divider' },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '🔄 Re-run Workflow', emoji: true },
          action_id: 'rerun_workflow',
          value: incident.id,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '📋 Create Issue', emoji: true },
          action_id: 'create_issue',
          value: incident.id,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '🗑 Dismiss', emoji: true },
          action_id: 'dismiss_incident',
          value: incident.id,
        },
        {
          type: 'overflow',
          action_id: 'snooze_incident',
          options: [
            { text: { type: 'plain_text', text: 'Snooze 1h' }, value: `${incident.id}:1` },
            { text: { type: 'plain_text', text: 'Snooze 4h' }, value: `${incident.id}:4` },
            { text: { type: 'plain_text', text: 'Snooze 24h' }, value: `${incident.id}:24` },
          ],
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '🚨 Escalate', emoji: true },
          action_id: 'escalate_incident',
          value: incident.id,
          style: 'danger',
        },
      ],
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `<${link}|View in Dashboard →>` }],
    },
  ]

  return blocks
}

export function briefReadyFallback(incident: IncidentContext, brief: IncidentBrief): string {
  const pct = Math.round(brief.confidence * 100)
  return `⚠️ CI Failure in ${incident.repo} — ${incident.workflowName}. Root cause: ${brief.rootCause} (${pct}% confidence). Fix: ${brief.suggestedFix}`
}

// ──────────────────────────────────────────────
// 3. Fixing — after user takes an action
// ──────────────────────────────────────────────

interface FixingContext {
  action: string // e.g. "Workflow re-run started", "PR #42 created"
  actor?: string | null
}

export function fixingBlocks(incident: IncidentContext, brief: IncidentBrief, fixing: FixingContext): SlackBlock[] {
  const link = dashboardUrl(incident.repo, incident.id)
  const badge = confidenceBadge(brief.confidence)
  const actorLine = fixing.actor ? ` by ${fixing.actor}` : ''

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: `🔧 Fixing — ${incident.repo}`, emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Workflow:*\n${incident.workflowName}` },
        { type: 'mrkdwn', text: `*Branch:*\n\`${incident.branch}\`` },
        { type: 'mrkdwn', text: `*Root Cause:*\n${brief.rootCause}` },
        { type: 'mrkdwn', text: `*Confidence:*\n${badge}` },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Action:* ${fixing.action}${actorLine}` },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `<${link}|View in Dashboard →>` }],
    },
  ]
}

export function fixingFallback(incident: IncidentContext, fixing: FixingContext): string {
  return `🔧 Fixing ${incident.repo} — ${fixing.action}`
}

// ──────────────────────────────────────────────
// 4. Resolved — incident resolved
// ──────────────────────────────────────────────

interface ResolvedContext {
  method: string // e.g. "Re-run succeeded", "PR merged", "Manually resolved"
  mttrSeconds?: number | null
}

function formatMttr(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function resolvedBlocks(incident: IncidentContext, resolved: ResolvedContext): SlackBlock[] {
  const link = dashboardUrl(incident.repo, incident.id)
  const mttrText = resolved.mttrSeconds != null ? formatMttr(resolved.mttrSeconds) : 'N/A'

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: `✅ Resolved — ${incident.repo}`, emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Workflow:*\n${incident.workflowName}` },
        { type: 'mrkdwn', text: `*Branch:*\n\`${incident.branch}\`` },
        { type: 'mrkdwn', text: `*Resolution:*\n${resolved.method}` },
        { type: 'mrkdwn', text: `*MTTR:*\n${mttrText}` },
      ],
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `<${link}|View in Dashboard →>` }],
    },
  ]
}

export function resolvedFallback(incident: IncidentContext, resolved: ResolvedContext): string {
  const mttr = resolved.mttrSeconds != null ? ` (MTTR: ${formatMttr(resolved.mttrSeconds)})` : ''
  return `✅ Resolved ${incident.repo} — ${resolved.method}${mttr}`
}
