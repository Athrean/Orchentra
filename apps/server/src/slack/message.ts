import { eq } from 'drizzle-orm'
import { slack } from './client'
import { config } from '../config'
import { db, incidents } from '../db/client'
import {
  investigatingBlocks,
  investigatingFallback,
  briefReadyBlocks,
  briefReadyFallback,
  fixingBlocks,
  fixingFallback,
  resolvedBlocks,
  resolvedFallback,
} from './blocks'
import type { IncidentBrief } from '@orchentra/core'

type IncidentRow = typeof incidents.$inferSelect

function toIncidentContext(incident: IncidentRow): {
  id: string
  repo: string
  branch: string
  commit: string
  workflowName: string
  workflowRunId: number | null
} {
  return {
    id: incident.id,
    repo: incident.repo,
    branch: incident.branch,
    commit: incident.commit,
    workflowName: incident.workflowName,
    workflowRunId: incident.workflowRunId,
  }
}

export async function postInitialSlackMessage(incident: IncidentRow): Promise<void> {
  const ctx = toIncidentContext(incident)
  try {
    const res = await slack.chat.postMessage({
      channel: config.delivery.slack.channel,
      text: investigatingFallback(ctx),
      blocks: investigatingBlocks(ctx),
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

export async function postThreadReply(incidentId: string, text: string): Promise<void> {
  const incident = await db.query.incidents.findFirst({
    where: eq(incidents.id, incidentId),
  })
  if (!incident?.slackMessageTs || !incident.slackChannel) return

  try {
    await slack.chat.postMessage({
      channel: incident.slackChannel,
      thread_ts: incident.slackMessageTs,
      text,
    })
  } catch (error) {
    console.error(`Failed to post thread reply for ${incidentId}:`, error)
  }
}

export async function updateSlackWithBrief(incidentId: string, brief: IncidentBrief): Promise<void> {
  const incident = await db.query.incidents.findFirst({
    where: eq(incidents.id, incidentId),
  })
  if (!incident?.slackMessageTs || !incident.slackChannel) return

  const ctx = toIncidentContext(incident)

  try {
    await slack.chat.update({
      channel: incident.slackChannel,
      ts: incident.slackMessageTs,
      text: briefReadyFallback(ctx, brief),
      blocks: briefReadyBlocks(ctx, brief),
    })
  } catch (error) {
    console.error(`Failed to update Slack message for ${incidentId}:`, error)
  }
}

export async function updateSlackToFixing(
  incidentId: string,
  brief: IncidentBrief,
  action: string,
  actor?: string | null,
): Promise<void> {
  const incident = await db.query.incidents.findFirst({
    where: eq(incidents.id, incidentId),
  })
  if (!incident?.slackMessageTs || !incident.slackChannel) return

  const ctx = toIncidentContext(incident)
  const fixing = { action, actor }

  try {
    await slack.chat.update({
      channel: incident.slackChannel,
      ts: incident.slackMessageTs,
      text: fixingFallback(ctx, fixing),
      blocks: fixingBlocks(ctx, brief, fixing),
    })
  } catch (error) {
    console.error(`Failed to update Slack message to fixing for ${incidentId}:`, error)
  }
}

export async function updateSlackToResolved(
  incidentId: string,
  method: string,
  mttrSeconds?: number | null,
): Promise<void> {
  const incident = await db.query.incidents.findFirst({
    where: eq(incidents.id, incidentId),
  })
  if (!incident?.slackMessageTs || !incident.slackChannel) return

  const ctx = toIncidentContext(incident)
  const resolved = { method, mttrSeconds }

  try {
    await slack.chat.update({
      channel: incident.slackChannel,
      ts: incident.slackMessageTs,
      text: resolvedFallback(ctx, resolved),
      blocks: resolvedBlocks(ctx, resolved),
    })
  } catch (error) {
    console.error(`Failed to update Slack message to resolved for ${incidentId}:`, error)
  }
}
