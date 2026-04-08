import { Hono } from 'hono'
import { createHmac, timingSafeEqual } from 'crypto'
import { z } from 'zod'
import { config } from '../config'
import { isRepoMonitored } from '../lib/repo-cache'
import { findMonitoredReposByRepo } from '../queries/repos'
import { createIncident } from '../queries/incidents'
import { handleFixPRMerged, autoResolveAfterCIPass } from '../actions/handlers'
import { incidentEvents } from '../events'
import { isDuplicateInFlight, registerInFlight } from '../lib/webhook-dedup'
import { enqueueInvestigateJob } from '../lib/incident-queue'
import {
  insertWebhookEvent,
  markWebhookProcessed,
  markWebhookFailed,
  markWebhookSkipped,
} from '../queries/webhook-events'

export const webhooksRouter = new Hono()

const PullRequestPayload = z.object({
  action: z.string(),
  number: z.number(),
  pull_request: z.object({
    html_url: z.string(),
    merged: z.boolean().nullable(),
    base: z.object({ ref: z.string() }),
  }),
  repository: z.object({ full_name: z.string() }),
})

// Validate the parts of the GitHub webhook payload we actually use
const WorkflowRunPayload = z.object({
  action: z.string(),
  workflow_run: z.object({
    id: z.number(),
    name: z.string(),
    head_branch: z.string(),
    head_sha: z.string(),
    conclusion: z.string().nullable(),
    created_at: z.string(),
    head_commit: z
      .object({
        message: z.string(),
      })
      .nullable()
      .optional(),
  }),
  repository: z.object({
    full_name: z.string(),
  }),
})

webhooksRouter.post('/github', async (c) => {
  const body = await c.req.text()
  const sig = c.req.header('x-hub-signature-256') ?? ''

  const expected = 'sha256=' + createHmac('sha256', config.github.webhook_secret).update(body).digest('hex')
  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expected)

  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return c.json({ error: 'Invalid signature' }, 401)
  }

  const deliveryId = c.req.header('x-github-delivery') ?? ''
  const event = c.req.header('x-github-event')

  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    return c.json({ error: 'Malformed JSON' }, 400)
  }

  // --- Hot-path dedup: reject if this delivery is already in-flight or recently settled ---
  if (deliveryId && isDuplicateInFlight('github', deliveryId)) {
    return c.json({ ok: true, deduplicated: true })
  }

  // --- Cold-path dedup: persist the event, skip if (provider, event_id) already exists ---
  let webhookEventId: string | null = null
  if (deliveryId) {
    const webhookEvent = await insertWebhookEvent({
      id: crypto.randomUUID(),
      provider: 'github',
      eventId: deliveryId,
      eventType: event ?? null,
      payload,
    })
    if (!webhookEvent) {
      return c.json({ ok: true, deduplicated: true })
    }
    webhookEventId = webhookEvent.id
  }

  // --- Process the event ---
  if (event === 'pull_request') {
    const parsed = PullRequestPayload.safeParse(payload)
    if (parsed.success && parsed.data.action === 'closed' && parsed.data.pull_request.merged) {
      const { pull_request: pr, number } = parsed.data
      handleFixPRMerged(pr.html_url, number).catch(console.error)
    }
    if (webhookEventId) markWebhookProcessed(webhookEventId).catch(console.error)
    return c.json({ ok: true })
  }

  if (event === 'workflow_run') {
    const parsed = WorkflowRunPayload.safeParse(payload)
    if (!parsed.success || parsed.data.action !== 'completed') {
      if (webhookEventId) markWebhookSkipped(webhookEventId).catch(console.error)
      return c.json({ ok: true })
    }

    const { workflow_run: run, repository } = parsed.data

    if (run.conclusion === 'failure') {
      const processingPromise = processWorkflowFailure(run, repository.full_name, webhookEventId)
      if (deliveryId) registerInFlight('github', deliveryId, processingPromise)
      processingPromise.catch(console.error)
    } else if (run.conclusion === 'success' && (await isRepoMonitored(repository.full_name))) {
      autoResolveAfterCIPass(repository.full_name.toLowerCase(), run.head_branch, run.id).catch(console.error)
      if (webhookEventId) markWebhookProcessed(webhookEventId).catch(console.error)
    } else {
      if (webhookEventId) markWebhookSkipped(webhookEventId).catch(console.error)
    }
  } else {
    // Unhandled event type
    if (webhookEventId) markWebhookSkipped(webhookEventId).catch(console.error)
  }

  return c.json({ ok: true })
})

async function processWorkflowFailure(
  run: z.infer<typeof WorkflowRunPayload>['workflow_run'],
  repo: string,
  webhookEventId: string | null,
): Promise<void> {
  try {
    if (!(await isRepoMonitored(repo))) {
      if (webhookEventId) await markWebhookSkipped(webhookEventId)
      return
    }

    const monitoredRepoRows = await findMonitoredReposByRepo(repo)
    if (monitoredRepoRows.length === 0) {
      if (webhookEventId) await markWebhookSkipped(webhookEventId)
      return
    }

    await Promise.all(
      monitoredRepoRows.map(async (monitoredRepo) => {
        const incident = await createIncident({
          id: crypto.randomUUID(),
          orgId: monitoredRepo.orgId,
          repo,
          branch: run.head_branch,
          commit: run.head_sha,
          workflowName: run.name,
          commitMessage: run.head_commit?.message?.split('\n')[0] ?? null,
          workflowRunId: run.id,
          status: 'investigating',
          triggeredAt: new Date(run.created_at),
        })

        if (!incident) return // duplicate workflow run for this org — already processing

        console.log(`Incident ${incident.id} queued — ${repo} / ${run.name} (org: ${monitoredRepo.orgId})`)

        incidentEvents.emitIncidentEvent({
          type: 'incident:created',
          incidentId: incident.id,
          orgId: monitoredRepo.orgId,
          repo,
        })

        await enqueueInvestigateJob(incident)
      }),
    )

    if (webhookEventId) await markWebhookProcessed(webhookEventId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (webhookEventId) await markWebhookFailed(webhookEventId, message).catch(console.error)
    throw err
  }
}
