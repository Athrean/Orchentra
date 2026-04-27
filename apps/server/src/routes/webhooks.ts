import { Hono, type Context } from 'hono'
import { createHmac, timingSafeEqual } from 'crypto'
import { z } from 'zod'
import { config } from '../config'
import { isRepoMonitored } from '../lib/repo-cache'
import { findMonitoredReposByRepo } from '../queries/repos'
import { createIncident } from '../queries/incidents'
import { handleFixPRMerged, autoResolveAfterCIPass } from '../actions/handlers'
import { incidentEvents } from '../events'
import { isDuplicateInFlight, registerInFlight, isDebounced, registerDebounce } from '../lib/webhook-dedup'
import { enqueueInvestigateJob } from '../lib/incident-queue'
import { publishInitialGithubTriage } from '../github/triage-writeback'
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

const CheckRunPayload = z.object({
  action: z.string(),
  check_run: z.object({
    id: z.number(),
    name: z.string(),
    head_sha: z.string(),
    conclusion: z.string().nullable(),
    started_at: z.string().nullable().optional(),
    completed_at: z.string().nullable().optional(),
    check_suite: z.object({
      id: z.number(),
      head_branch: z.string().nullable(),
    }),
  }),
  repository: z.object({ full_name: z.string() }),
})

const CheckSuitePayload = z.object({
  action: z.string(),
  check_suite: z.object({
    id: z.number(),
    head_branch: z.string().nullable(),
    head_sha: z.string(),
    conclusion: z.string().nullable(),
    created_at: z.string().nullable().optional(),
  }),
  repository: z.object({ full_name: z.string() }),
})

interface NormalizedFailure {
  runId: number
  workflowName: string
  branch: string
  commit: string
  commitMessage: string | null
  createdAt: string
}

webhooksRouter.post('/github', async (c) => {
  const body = await c.req.text()
  const sig = c.req.header('x-hub-signature-256') ?? ''

  const expected = 'sha256=' + createHmac('sha256', config.github.webhook_secret).update(body).digest('hex')
  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expected)

  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return c.json({ error: 'Invalid signature' }, 401)
  }

  const rawDeliveryId = c.req.header('x-github-delivery')
  // GitHub normally supplies a UUID delivery ID. If it's missing or empty, fall back to a
  // deterministic hash of the body so both dedup layers still engage on duplicate payloads.
  const deliveryId =
    rawDeliveryId && rawDeliveryId.length > 0
      ? rawDeliveryId
      : 'synthetic-' + createHmac('sha256', 'orchentra-dedup').update(body).digest('hex').slice(0, 32)
  const event = c.req.header('x-github-event')

  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    return c.json({ error: 'Malformed JSON' }, 400)
  }

  // --- Hot-path dedup: reject if this delivery is already in-flight or recently settled ---
  if (isDuplicateInFlight('github', deliveryId)) {
    return c.json({ ok: true, deduplicated: true })
  }

  // --- Cold-path dedup: persist the event, skip if (provider, event_id) already exists ---
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
  const webhookEventId: string = webhookEvent.id

  // --- Process the event ---
  if (event === 'pull_request') {
    const parsed = PullRequestPayload.safeParse(payload)
    if (parsed.success && parsed.data.action === 'closed' && parsed.data.pull_request.merged) {
      const { pull_request: pr, number } = parsed.data
      const repo = parsed.data.repository.full_name
      const monitoredRepoRows = await findMonitoredReposByRepo(repo)
      for (const { orgId } of monitoredRepoRows) {
        handleFixPRMerged(pr.html_url, number, orgId).catch(console.error)
      }
    }
    markWebhookProcessed(webhookEventId).catch(console.error)
    return c.json({ ok: true })
  }

  if (event === 'workflow_run') {
    const parsed = WorkflowRunPayload.safeParse(payload)
    if (!parsed.success || parsed.data.action !== 'completed') {
      markWebhookSkipped(webhookEventId).catch(console.error)
      return c.json({ ok: true })
    }

    const { workflow_run: run, repository } = parsed.data

    if (run.conclusion === 'failure') {
      const repo = repository.full_name.toLowerCase()
      const failure: NormalizedFailure = {
        runId: run.id,
        workflowName: run.name,
        branch: run.head_branch,
        commit: run.head_sha,
        commitMessage: run.head_commit?.message?.split('\n')[0] ?? null,
        createdAt: run.created_at,
      }
      return await dispatchFailure(c, failure, repo, webhookEventId, deliveryId)
    } else if (run.conclusion === 'success' && (await isRepoMonitored(repository.full_name))) {
      const repo = repository.full_name.toLowerCase()
      const monitoredRepoRows = await findMonitoredReposByRepo(repo)
      for (const { orgId } of monitoredRepoRows) {
        autoResolveAfterCIPass(repo, run.head_branch, run.id, orgId).catch(console.error)
      }
      markWebhookProcessed(webhookEventId).catch(console.error)
    } else {
      markWebhookSkipped(webhookEventId).catch(console.error)
    }
  } else if (event === 'check_run') {
    const parsed = CheckRunPayload.safeParse(payload)
    if (!parsed.success || parsed.data.action !== 'completed' || parsed.data.check_run.conclusion !== 'failure') {
      markWebhookSkipped(webhookEventId).catch(console.error)
      return c.json({ ok: true })
    }
    const { check_run: run, repository } = parsed.data
    const branch = run.check_suite.head_branch
    if (!branch) {
      markWebhookSkipped(webhookEventId).catch(console.error)
      return c.json({ ok: true })
    }
    const repo = repository.full_name.toLowerCase()
    const failure: NormalizedFailure = {
      runId: run.id,
      workflowName: run.name,
      branch,
      commit: run.head_sha,
      commitMessage: null,
      createdAt: run.started_at ?? run.completed_at ?? new Date().toISOString(),
    }
    return await dispatchFailure(c, failure, repo, webhookEventId, deliveryId)
  } else if (event === 'check_suite') {
    const parsed = CheckSuitePayload.safeParse(payload)
    if (!parsed.success || parsed.data.action !== 'completed' || parsed.data.check_suite.conclusion !== 'failure') {
      markWebhookSkipped(webhookEventId).catch(console.error)
      return c.json({ ok: true })
    }
    const { check_suite: suite, repository } = parsed.data
    if (!suite.head_branch) {
      markWebhookSkipped(webhookEventId).catch(console.error)
      return c.json({ ok: true })
    }
    const repo = repository.full_name.toLowerCase()
    const failure: NormalizedFailure = {
      runId: suite.id,
      workflowName: 'check_suite',
      branch: suite.head_branch,
      commit: suite.head_sha,
      commitMessage: null,
      createdAt: suite.created_at ?? new Date().toISOString(),
    }
    return await dispatchFailure(c, failure, repo, webhookEventId, deliveryId)
  } else {
    // Unhandled event type
    markWebhookSkipped(webhookEventId).catch(console.error)
  }

  return c.json({ ok: true })
})

async function dispatchFailure(
  c: Context,
  failure: NormalizedFailure,
  repo: string,
  webhookEventId: string,
  deliveryId: string,
): Promise<Response> {
  if (isDebounced(repo, failure.branch, failure.commit)) {
    markWebhookSkipped(webhookEventId).catch(console.error)
    return c.json({ ok: true, debounced: true })
  }
  registerDebounce(repo, failure.branch, failure.commit)

  const processingPromise = processNormalizedFailure(failure, repo, webhookEventId)
  registerInFlight('github', deliveryId, processingPromise)
  processingPromise.catch(console.error)

  return c.json({ ok: true })
}

async function processNormalizedFailure(
  failure: NormalizedFailure,
  repo: string,
  webhookEventId: string,
): Promise<void> {
  try {
    if (!(await isRepoMonitored(repo))) {
      await markWebhookSkipped(webhookEventId)
      return
    }

    const monitoredRepoRows = await findMonitoredReposByRepo(repo)
    if (monitoredRepoRows.length === 0) {
      await markWebhookSkipped(webhookEventId)
      return
    }

    await Promise.all(
      monitoredRepoRows.map(async (monitoredRepo) => {
        const incident = await createIncident({
          id: crypto.randomUUID(),
          orgId: monitoredRepo.orgId,
          repo,
          branch: failure.branch,
          commit: failure.commit,
          workflowName: failure.workflowName,
          commitMessage: failure.commitMessage,
          workflowRunId: failure.runId,
          status: 'investigating',
          triggeredAt: new Date(failure.createdAt),
        })

        if (!incident) return // duplicate run id for this org — already processing

        console.log(`Incident ${incident.id} queued — ${repo} / ${failure.workflowName} (org: ${monitoredRepo.orgId})`)

        incidentEvents.emitIncidentEvent({
          type: 'incident:created',
          incidentId: incident.id,
          orgId: monitoredRepo.orgId,
          repo,
        })

        await publishInitialGithubTriage(incident)
        await enqueueInvestigateJob(incident)
      }),
    )

    await markWebhookProcessed(webhookEventId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await markWebhookFailed(webhookEventId, message).catch(console.error)
    throw err
  }
}
