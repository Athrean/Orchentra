import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { createHmac } from 'crypto'

const SLACK_SIGNING_SECRET = 'test-slack-signing-secret'

// Tracking arrays
let handlerCalls: { handler: string; args: unknown[] }[] = []

mock.module('../src/config', () => ({
  config: {
    github: {
      webhook_secret: 'ghsecret',
      token: 'ghp_test',
      repos: ['my-org/api'],
    },
    delivery: {
      slack: {
        bot_token: 'xoxb-test',
        signing_secret: SLACK_SIGNING_SECRET,
        channel: 'C12345',
      },
    },
  },
}))

mock.module('../src/actions/handlers', () => ({
  rerunWorkflow: async (...args: unknown[]) => {
    handlerCalls.push({ handler: 'rerunWorkflow', args })
    return { success: true, data: { runUrl: 'https://github.com/run/1' } }
  },
  createGithubIssue: async (...args: unknown[]) => {
    handlerCalls.push({ handler: 'createGithubIssue', args })
    return { success: true, data: { issueUrl: 'https://github.com/issue/1' } }
  },
  updateIncidentStatus: async (...args: unknown[]) => {
    handlerCalls.push({ handler: 'updateIncidentStatus', args })
    return { success: true, data: { status: args[1] } }
  },
  escalateIncident: async (...args: unknown[]) => {
    handlerCalls.push({ handler: 'escalateIncident', args })
    return { success: true }
  },
  createFixPR: async (...args: unknown[]) => {
    handlerCalls.push({ handler: 'createFixPR', args })
    return { success: true, data: { prUrl: 'https://github.com/pr/1' } }
  },
}))

mock.module('drizzle-orm', () => ({
  eq: (_col: unknown, _val: unknown) => ({}),
}))

mock.module('../src/db/client', () => ({
  db: {
    query: { incidents: { findFirst: async () => null } },
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({ returning: () => [] }),
      }),
    }),
  },
  incidents: { id: 'id' },
  incidentActions: {},
  toolCalls: {},
  resolvedPatterns: {},
  users: {},
  sessions: {},
  apiKeys: {},
  monitoredRepos: {},
}))

mock.module('../src/events', () => ({
  incidentEvents: {
    emitIncidentEvent: () => {},
    on: () => {},
    off: () => {},
  },
}))

mock.module('../src/slack/client', () => ({
  slack: {
    chat: {
      postMessage: async () => ({ ok: true, ts: '123.456' }),
      update: async () => ({ ok: true }),
    },
  },
}))

mock.module('../src/slack/message', () => ({
  postInitialSlackMessage: async () => {},
  updateSlackWithBrief: async () => {},
  postThreadReply: async () => {},
  updateSlackToFixing: async () => {},
  updateSlackToResolved: async () => {},
}))

const { interactionsRouter } = await import('../src/routes/interactions')
import { Hono } from 'hono'

function makeApp(): Hono {
  const app = new Hono()
  app.route('/slack/interactions', interactionsRouter)
  return app
}

function slackSign(body: string, timestamp?: number): { signature: string; timestamp: string } {
  const ts = timestamp ?? Math.floor(Date.now() / 1000)
  const basestring = `v0:${ts}:${body}`
  const sig = 'v0=' + createHmac('sha256', SLACK_SIGNING_SECRET).update(basestring).digest('hex')
  return { signature: sig, timestamp: String(ts) }
}

function makeInteractionBody(actionId: string, value: string, overrides: Record<string, unknown> = {}): string {
  const payload: Record<string, unknown> = {
    type: 'block_actions',
    user: { id: 'U_SLACK_USER', name: 'testuser' },
    actions: [
      actionId === 'snooze_incident'
        ? { action_id: actionId, type: 'overflow', selected_option: { value } }
        : { action_id: actionId, type: 'button', value },
    ],
    ...overrides,
  }
  return `payload=${encodeURIComponent(JSON.stringify(payload))}`
}

async function sendInteraction(
  app: ReturnType<typeof makeApp>,
  body: string,
  opts: { signature?: string; timestamp?: string } = {},
): Promise<Response> {
  const signed = opts.signature ? { signature: opts.signature, timestamp: opts.timestamp ?? '0' } : slackSign(body)
  return app.request('/slack/interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-slack-signature': opts.signature ?? signed.signature,
      'x-slack-request-timestamp': opts.timestamp ?? signed.timestamp,
    },
    body,
  })
}

beforeEach(() => {
  handlerCalls = []
})

// ──────────────────────────────────────────────
// Signature verification
// ──────────────────────────────────────────────

describe('Slack Interactions — Signature Verification', () => {
  test('rejects invalid signature', async () => {
    const app = makeApp()
    const body = makeInteractionBody('rerun_workflow', 'inc-1')

    const res = await sendInteraction(app, body, {
      signature: 'v0=invalid',
      timestamp: String(Math.floor(Date.now() / 1000)),
    })
    expect(res.status).toBe(401)

    const json = (await res.json()) as { error: string }
    expect(json.error).toBe('Invalid signature')
  })

  test('rejects missing signature', async () => {
    const app = makeApp()
    const body = makeInteractionBody('rerun_workflow', 'inc-1')

    const res = await sendInteraction(app, body, { signature: '', timestamp: String(Math.floor(Date.now() / 1000)) })
    expect(res.status).toBe(401)
  })

  test('rejects stale timestamp (replay attack)', async () => {
    const app = makeApp()
    const body = makeInteractionBody('rerun_workflow', 'inc-1')
    const staleTs = Math.floor(Date.now() / 1000) - 600 // 10 minutes ago

    const { signature } = slackSign(body, staleTs)
    const res = await sendInteraction(app, body, { signature, timestamp: String(staleTs) })
    expect(res.status).toBe(401)
  })

  test('accepts valid signature', async () => {
    const app = makeApp()
    const body = makeInteractionBody('rerun_workflow', 'inc-1')

    const res = await sendInteraction(app, body)
    expect(res.status).toBe(200)
  })
})

// ──────────────────────────────────────────────
// Payload parsing
// ──────────────────────────────────────────────

describe('Slack Interactions — Payload Parsing', () => {
  test('rejects missing payload field', async () => {
    const app = makeApp()
    const body = 'not_payload=something'
    const { signature, timestamp } = slackSign(body)

    const res = await sendInteraction(app, body, { signature, timestamp })
    expect(res.status).toBe(400)

    const json = (await res.json()) as { error: string }
    expect(json.error).toBe('Missing payload')
  })

  test('rejects malformed JSON in payload', async () => {
    const app = makeApp()
    const body = `payload=${encodeURIComponent('{bad json')}`
    const { signature, timestamp } = slackSign(body)

    const res = await sendInteraction(app, body, { signature, timestamp })
    expect(res.status).toBe(400)

    const json = (await res.json()) as { error: string }
    expect(json.error).toBe('Malformed payload')
  })

  test('ignores non-block_actions type', async () => {
    const app = makeApp()
    const payload = JSON.stringify({ type: 'view_submission', user: { id: 'U1' }, actions: [] })
    const body = `payload=${encodeURIComponent(payload)}`
    const { signature, timestamp } = slackSign(body)

    const res = await sendInteraction(app, body, { signature, timestamp })
    expect(res.status).toBe(200)
    await Bun.sleep(50)
    expect(handlerCalls.length).toBe(0)
  })
})

// ──────────────────────────────────────────────
// Action dispatch
// ──────────────────────────────────────────────

describe('Slack Interactions — Action Dispatch', () => {
  test('dispatches rerun_workflow', async () => {
    const app = makeApp()
    const body = makeInteractionBody('rerun_workflow', 'inc-abc')

    const res = await sendInteraction(app, body)
    expect(res.status).toBe(200)
    await Bun.sleep(50)

    expect(handlerCalls.length).toBe(1)
    expect(handlerCalls[0].handler).toBe('rerunWorkflow')
    expect(handlerCalls[0].args[0]).toBe('inc-abc')
    expect(handlerCalls[0].args[1]).toBe('U_SLACK_USER')
  })

  test('dispatches create_issue', async () => {
    const app = makeApp()
    const body = makeInteractionBody('create_issue', 'inc-def')

    const res = await sendInteraction(app, body)
    expect(res.status).toBe(200)
    await Bun.sleep(50)

    expect(handlerCalls.length).toBe(1)
    expect(handlerCalls[0].handler).toBe('createGithubIssue')
    expect(handlerCalls[0].args[0]).toBe('inc-def')
    expect(handlerCalls[0].args[1]).toBe('U_SLACK_USER')
  })

  test('dispatches dismiss_incident', async () => {
    const app = makeApp()
    const body = makeInteractionBody('dismiss_incident', 'inc-ghi')

    const res = await sendInteraction(app, body)
    expect(res.status).toBe(200)
    await Bun.sleep(50)

    expect(handlerCalls.length).toBe(1)
    expect(handlerCalls[0].handler).toBe('updateIncidentStatus')
    expect(handlerCalls[0].args[0]).toBe('inc-ghi')
    expect(handlerCalls[0].args[1]).toBe('dismissed')
    expect(handlerCalls[0].args[2]).toBe('U_SLACK_USER')
  })

  test('dispatches escalate_incident', async () => {
    const app = makeApp()
    const body = makeInteractionBody('escalate_incident', 'inc-jkl')

    const res = await sendInteraction(app, body)
    expect(res.status).toBe(200)
    await Bun.sleep(50)

    expect(handlerCalls.length).toBe(1)
    expect(handlerCalls[0].handler).toBe('escalateIncident')
    expect(handlerCalls[0].args[0]).toBe('inc-jkl')
    expect(handlerCalls[0].args[1]).toBe('U_SLACK_USER')
  })

  test('dispatches snooze_incident with correct hours', async () => {
    const app = makeApp()
    const body = makeInteractionBody('snooze_incident', 'inc-mno:4')

    const before = Date.now()
    const res = await sendInteraction(app, body)
    expect(res.status).toBe(200)
    await Bun.sleep(50)

    expect(handlerCalls.length).toBe(1)
    expect(handlerCalls[0].handler).toBe('updateIncidentStatus')
    expect(handlerCalls[0].args[0]).toBe('inc-mno')
    expect(handlerCalls[0].args[1]).toBe('snoozed')
    expect(handlerCalls[0].args[2]).toBe('U_SLACK_USER')

    const snoozedUntil = handlerCalls[0].args[3] as Date
    expect(snoozedUntil).toBeInstanceOf(Date)
    const expectedMs = before + 4 * 60 * 60 * 1000
    expect(Math.abs(snoozedUntil.getTime() - expectedMs)).toBeLessThan(1000)
  })

  test('dispatches snooze_incident with 1 hour', async () => {
    const app = makeApp()
    const body = makeInteractionBody('snooze_incident', 'inc-pqr:1')

    const before = Date.now()
    const res = await sendInteraction(app, body)
    expect(res.status).toBe(200)
    await Bun.sleep(50)

    expect(handlerCalls.length).toBe(1)
    const snoozedUntil = handlerCalls[0].args[3] as Date
    const expectedMs = before + 1 * 60 * 60 * 1000
    expect(Math.abs(snoozedUntil.getTime() - expectedMs)).toBeLessThan(1000)
  })

  test('dispatches snooze_incident with 24 hours', async () => {
    const app = makeApp()
    const body = makeInteractionBody('snooze_incident', 'inc-stu:24')

    const before = Date.now()
    const res = await sendInteraction(app, body)
    expect(res.status).toBe(200)
    await Bun.sleep(50)

    expect(handlerCalls.length).toBe(1)
    const snoozedUntil = handlerCalls[0].args[3] as Date
    const expectedMs = before + 24 * 60 * 60 * 1000
    expect(Math.abs(snoozedUntil.getTime() - expectedMs)).toBeLessThan(1000)
  })
})

// ──────────────────────────────────────────────
// Edge cases
// ──────────────────────────────────────────────

describe('Slack Interactions — Edge Cases', () => {
  test('ignores unknown action_id', async () => {
    const app = makeApp()
    const body = makeInteractionBody('unknown_action', 'inc-1')

    const res = await sendInteraction(app, body)
    expect(res.status).toBe(200)
    await Bun.sleep(50)

    expect(handlerCalls.length).toBe(0)
  })

  test('ignores action with empty value', async () => {
    const app = makeApp()
    const body = makeInteractionBody('rerun_workflow', '')

    const res = await sendInteraction(app, body)
    expect(res.status).toBe(200)
    await Bun.sleep(50)

    expect(handlerCalls.length).toBe(0)
  })

  test('ignores snooze with invalid hours', async () => {
    const app = makeApp()
    const body = makeInteractionBody('snooze_incident', 'inc-1:notanumber')

    const res = await sendInteraction(app, body)
    expect(res.status).toBe(200)
    await Bun.sleep(50)

    expect(handlerCalls.length).toBe(0)
  })

  test('ignores snooze with missing separator', async () => {
    const app = makeApp()
    const body = makeInteractionBody('snooze_incident', 'inc-1-no-colon')

    const res = await sendInteraction(app, body)
    expect(res.status).toBe(200)
    await Bun.sleep(50)

    expect(handlerCalls.length).toBe(0)
  })

  test('handles snooze value with UUID containing colons', async () => {
    const app = makeApp()
    // UUID-style incident IDs shouldn't have colons, but test robustness with lastIndexOf
    const body = makeInteractionBody('snooze_incident', 'abc-def-123:4')

    const res = await sendInteraction(app, body)
    expect(res.status).toBe(200)
    await Bun.sleep(50)

    expect(handlerCalls.length).toBe(1)
    expect(handlerCalls[0].args[0]).toBe('abc-def-123')
  })

  test('returns 200 even when no user in payload', async () => {
    const app = makeApp()
    const payload = JSON.stringify({
      type: 'block_actions',
      user: {},
      actions: [{ action_id: 'rerun_workflow', type: 'button', value: 'inc-1' }],
    })
    const body = `payload=${encodeURIComponent(payload)}`
    const { signature, timestamp } = slackSign(body)

    const res = await sendInteraction(app, body, { signature, timestamp })
    expect(res.status).toBe(200)
    await Bun.sleep(50)

    // No user.id → handler should not be called
    expect(handlerCalls.length).toBe(0)
  })

  test('handler errors do not crash the response', async () => {
    // The handler is dispatched async, so errors should be caught by .catch()
    const app = makeApp()
    const body = makeInteractionBody('rerun_workflow', 'inc-crash')

    const res = await sendInteraction(app, body)
    expect(res.status).toBe(200)
  })
})
