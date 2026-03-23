import { Hono } from 'hono'
import { createHmac, timingSafeEqual } from 'crypto'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { config } from '../config'
import { db, incidents } from '../db/client'
import { runIncidentAgent } from '../agent/runner'
import { postInitialSlackMessage } from '../slack/message'

export const webhooksRouter = new Hono()

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

  const event = c.req.header('x-github-event')
  if (event !== 'workflow_run') return c.json({ ok: true })

  const parsed = WorkflowRunPayload.safeParse(JSON.parse(body))
  if (!parsed.success) return c.json({ ok: true })

  const { workflow_run: run, repository } = parsed.data
  if (parsed.data.action !== 'completed' || run.conclusion !== 'failure') return c.json({ ok: true })

  // Deduplicate
  const existing = await db.query.incidents.findFirst({
    where: eq(incidents.workflowRunId, run.id),
  })
  if (!existing) {
    processWorkflowFailure(run, repository.full_name).catch(console.error)
  }

  return c.json({ ok: true })
})

async function processWorkflowFailure(run: z.infer<typeof WorkflowRunPayload>['workflow_run'], repo: string) {
  const [incident] = await db
    .insert(incidents)
    .values({
      id: crypto.randomUUID(),
      repo,
      branch: run.head_branch,
      commit: run.head_sha,
      workflowName: run.name,
      workflowRunId: run.id,
      status: 'investigating',
      triggeredAt: new Date(run.created_at),
    })
    .returning()

  console.log(`🔍 Incident ${incident.id} — ${repo} / ${run.name}`)

  await postInitialSlackMessage(incident)
  await runIncidentAgent(incident)
}
