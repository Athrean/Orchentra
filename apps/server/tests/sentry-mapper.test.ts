import { describe, expect, test } from 'bun:test'
import { buildAlertExecution } from '../src/integrations/sentry'
import type { SentryEvent } from '../src/integrations/sentry'

const baseEvent: SentryEvent = {
  eventId: 'evt_abc',
  title: "TypeError: Cannot read property 'x' of undefined",
  level: 'error',
  platform: 'javascript',
  url: 'https://sentry.io/organizations/o/issues/12345/',
  issueId: '12345',
  shortId: 'PROJECT-1',
  installationUuid: 'inst-uuid',
  tags: {},
}

describe('buildAlertExecution', () => {
  test('produces an execution row with kind=alert', () => {
    const row = buildAlertExecution(baseEvent, {
      orgId: 'org-1',
      id: 'exec-1',
      triggeredAt: new Date('2026-04-28T00:00:00Z'),
    })
    expect(row.kind).toBe('alert')
    expect(row.id).toBe('exec-1')
    expect(row.orgId).toBe('org-1')
    expect(row.status).toBe('investigating')
    expect(row.triggeredAt).toEqual(new Date('2026-04-28T00:00:00Z'))
  })

  test('uses Sentry repo / commit tags when present', () => {
    const event: SentryEvent = {
      ...baseEvent,
      tags: { repo: 'my-org/api', release: 'sha-abcdef0123456789', environment: 'production' },
    }
    const row = buildAlertExecution(event, { orgId: 'org-1', id: 'exec-1', triggeredAt: new Date() })
    expect(row.repo).toBe('my-org/api')
    expect(row.commit).toBe('sha-abcdef0123456789')
    expect(row.branch).toBe('production')
  })

  test('falls back to placeholders when expected tags are missing', () => {
    const row = buildAlertExecution(baseEvent, { orgId: 'org-1', id: 'exec-1', triggeredAt: new Date() })
    expect(row.repo).toBe('unknown')
    expect(row.commit).toBe('unknown')
    expect(row.branch).toBe('unknown')
  })

  test('uses Sentry shortId as the workflowName so the dashboard renders something sensible', () => {
    const row = buildAlertExecution(baseEvent, { orgId: 'org-1', id: 'exec-1', triggeredAt: new Date() })
    expect(row.workflowName).toBe('PROJECT-1')
  })

  test('puts the Sentry issue title into commitMessage so dashboards show the alert summary', () => {
    const row = buildAlertExecution(baseEvent, { orgId: 'org-1', id: 'exec-1', triggeredAt: new Date() })
    expect(row.commitMessage).toBe(baseEvent.title)
  })
})
