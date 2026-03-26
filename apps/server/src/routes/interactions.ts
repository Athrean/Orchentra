import { Hono } from 'hono'
import { createHmac, timingSafeEqual } from 'crypto'
import { config } from '../config'
import { rerunWorkflow, createGithubIssue, updateIncidentStatus, escalateIncident } from '../actions/handlers'

export const interactionsRouter = new Hono()

function verifySlackSignature(body: string, timestamp: string, signature: string): boolean {
  const fiveMinutes = 5 * 60
  const now = Math.floor(Date.now() / 1000)
  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return false
  if (Math.abs(now - ts) > fiveMinutes) return false

  const basestring = `v0:${timestamp}:${body}`
  const expected = 'v0=' + createHmac('sha256', config.delivery.slack.signing_secret).update(basestring).digest('hex')

  const sigBuf = Buffer.from(signature)
  const expectedBuf = Buffer.from(expected)
  if (sigBuf.length !== expectedBuf.length) return false

  return timingSafeEqual(sigBuf, expectedBuf)
}

interface SlackAction {
  action_id: string
  type: string
  value?: string
  selected_option?: { value: string }
}

interface SlackInteractionPayload {
  type: string
  user: { id: string; name?: string }
  actions: SlackAction[]
}

async function dispatchAction(action: SlackAction, slackUserId: string): Promise<void> {
  switch (action.action_id) {
    case 'rerun_workflow': {
      const incidentId = action.value
      if (!incidentId) return
      await rerunWorkflow(incidentId, slackUserId)
      break
    }

    case 'create_issue': {
      const incidentId = action.value
      if (!incidentId) return
      await createGithubIssue(incidentId, slackUserId)
      break
    }

    case 'dismiss_incident': {
      const incidentId = action.value
      if (!incidentId) return
      await updateIncidentStatus(incidentId, 'dismissed', slackUserId)
      break
    }

    case 'snooze_incident': {
      const raw = action.selected_option?.value ?? action.value
      if (!raw) return
      const separatorIndex = raw.lastIndexOf(':')
      if (separatorIndex === -1) return
      const incidentId = raw.slice(0, separatorIndex)
      const hours = Number(raw.slice(separatorIndex + 1))
      const allowedHours = [1, 4, 24]
      if (!incidentId || isNaN(hours) || !allowedHours.includes(hours)) return
      const snoozedUntil = new Date(Date.now() + hours * 60 * 60 * 1000)
      await updateIncidentStatus(incidentId, 'snoozed', slackUserId, snoozedUntil)
      break
    }

    case 'escalate_incident': {
      const incidentId = action.value
      if (!incidentId) return
      await escalateIncident(incidentId, slackUserId)
      break
    }

    default:
      console.warn(`Unknown Slack action_id: ${action.action_id}`)
  }
}

interactionsRouter.post('/', async (c) => {
  const body = await c.req.text()
  const timestamp = c.req.header('x-slack-request-timestamp') ?? ''
  const signature = c.req.header('x-slack-signature') ?? ''

  if (!verifySlackSignature(body, timestamp, signature)) {
    return c.json({ error: 'Invalid signature' }, 401)
  }

  const payloadStr = new URLSearchParams(body).get('payload')
  if (!payloadStr) return c.json({ error: 'Missing payload' }, 400)

  let payload: SlackInteractionPayload
  try {
    payload = JSON.parse(payloadStr)
  } catch {
    return c.json({ error: 'Malformed payload' }, 400)
  }

  if (payload.type !== 'block_actions') return c.json({ ok: true })

  const slackUserId = payload.user?.id
  if (!slackUserId) return c.json({ ok: true })

  // Respond immediately — Slack requires 200 within 3 seconds.
  // Dispatch actions asynchronously.
  for (const action of payload.actions ?? []) {
    dispatchAction(action, slackUserId).catch((err) => {
      console.error(`Slack action ${action.action_id} failed:`, err)
    })
  }

  return c.json({ ok: true })
})
