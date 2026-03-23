import { eq } from 'drizzle-orm'
import { slack } from './client'
import { config } from '../config'
import { db, incidents } from '../db/client'
import type { IncidentBrief } from '@orchentra/core'

type IncidentRow = typeof incidents.$inferSelect

export async function postInitialSlackMessage(incident: IncidentRow): Promise<void> {
  try {
    const res = await slack.chat.postMessage({
      channel: config.delivery.slack.channel,
      text: [
        `*CI failure* in \`${incident.repo}\``,
        `Workflow: *${incident.workflowName}* on \`${incident.branch}\``,
        `Commit: \`${incident.commit.slice(0, 7)}\``,
        '',
        '_Investigating... fetching logs and classifying failure._',
      ].join('\n'),
    })

    if (!res.ts) {
      console.error(`Slack postMessage succeeded but returned no ts for ${incident.id}`)
      return
    }

    await db
      .update(incidents)
      .set({ slackMessageTs: res.ts, slackChannel: config.delivery.slack.channel })
      .where(eq(incidents.id, incident.id))
  } catch (error) {
    console.error(`Failed to post Slack message for ${incident.id}:`, error)
  }
}

export async function updateSlackWithBrief(incidentId: string, brief: IncidentBrief): Promise<void> {
  const incident = await db.query.incidents.findFirst({
    where: eq(incidents.id, incidentId),
  })
  if (!incident?.slackMessageTs || !incident.slackChannel) return

  const confidencePct = Math.round(brief.confidence * 100)

  try {
    await slack.chat.update({
      channel: incident.slackChannel,
      ts: incident.slackMessageTs,
      text: [
        `*CI failure* · \`${incident.repo}\` · *${incident.workflowName}*`,
        `Branch: \`${incident.branch}\` · Commit: \`${incident.commit.slice(0, 7)}\``,
        '',
        `*Classification:* ${brief.failureType.replace(/_/g, ' ')}`,
        `*Root cause:* ${brief.rootCause}`,
        `*Suggested fix:* ${brief.suggestedFix}`,
        `*Confidence:* ${confidencePct}%`,
        '',
        `> ${brief.summary}`,
      ].join('\n'),
    })
  } catch (error) {
    console.error(`Failed to update Slack message for ${incidentId}:`, error)
  }
}
