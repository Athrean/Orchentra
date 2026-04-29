import { describe, expect, test } from 'bun:test'
import { parseSentryEvent } from '../src/integrations/sentry'

describe('parseSentryEvent', () => {
  test('returns error on non-object input', () => {
    expect(parseSentryEvent(null).kind).toBe('error')
    expect(parseSentryEvent('').kind).toBe('error')
    expect(parseSentryEvent(42).kind).toBe('error')
  })

  test('parses minimal issue_alert payload', () => {
    const payload = {
      action: 'triggered',
      data: {
        event: {
          event_id: 'evt_abc',
          title: "TypeError: Cannot read property 'x' of undefined",
          level: 'error',
          platform: 'javascript',
          tags: [],
          url: 'https://sentry.io/organizations/o/issues/12345/',
        },
        issue: {
          id: '12345',
          shortId: 'PROJECT-1',
          title: "TypeError: Cannot read property 'x' of undefined",
          permalink: 'https://sentry.io/organizations/o/issues/12345/',
        },
      },
      installation: { uuid: 'inst_uuid' },
    }
    const result = parseSentryEvent(payload)
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.value.eventId).toBe('evt_abc')
    expect(result.value.title).toBe("TypeError: Cannot read property 'x' of undefined")
    expect(result.value.level).toBe('error')
    expect(result.value.platform).toBe('javascript')
    expect(result.value.url).toBe('https://sentry.io/organizations/o/issues/12345/')
    expect(result.value.issueId).toBe('12345')
    expect(result.value.shortId).toBe('PROJECT-1')
    expect(result.value.installationUuid).toBe('inst_uuid')
    expect(result.value.tags).toEqual({})
  })

  test('flattens tag tuples into an object', () => {
    const payload = {
      action: 'triggered',
      data: {
        event: {
          event_id: 'evt_abc',
          title: 'oops',
          level: 'error',
          platform: 'python',
          tags: [
            ['environment', 'production'],
            ['release', 'sha-abc123'],
            ['server', 'web-01'],
          ],
          url: 'https://sentry.io/x',
        },
        issue: { id: '1', shortId: 'P-1', title: 'oops', permalink: 'https://sentry.io/x' },
      },
    }
    const result = parseSentryEvent(payload)
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.value.tags).toEqual({
      environment: 'production',
      release: 'sha-abc123',
      server: 'web-01',
    })
  })

  test('rejects when required fields are missing', () => {
    const result = parseSentryEvent({ action: 'triggered', data: { issue: { id: '1' } } })
    expect(result.kind).toBe('error')
  })

  test('treats non-tuple tag entries as parse errors not silent drops', () => {
    const payload = {
      action: 'triggered',
      data: {
        event: {
          event_id: 'e',
          title: 't',
          level: 'error',
          platform: 'js',
          tags: [['environment', 'prod'], 'not-a-tuple'],
          url: 'https://sentry.io/x',
        },
        issue: { id: '1', shortId: 's', title: 't', permalink: 'p' },
      },
    }
    expect(parseSentryEvent(payload).kind).toBe('error')
  })
})
