import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

/**
 * Strict subset of the Sentry "issue_alert" webhook payload that we use to
 * spawn an `alert` execution. Sentry sends a much larger envelope; we only
 * extract what the agent needs to triage and what the dedup layer needs to
 * stay idempotent.
 */
export interface SentryEvent {
  eventId: string
  title: string
  level: string
  platform: string
  url: string
  issueId: string
  shortId: string
  installationUuid: string | null
  tags: Record<string, string>
}

export type ParseResult<T> = { kind: 'ok'; value: T } | { kind: 'error'; message: string }

const TagTupleSchema = z.tuple([z.string(), z.string()])

const SentryWebhookSchema = z.object({
  action: z.string(),
  data: z.object({
    event: z.object({
      event_id: z.string(),
      title: z.string(),
      level: z.string(),
      platform: z.string(),
      tags: z.array(TagTupleSchema),
      url: z.string(),
    }),
    issue: z.object({
      id: z.string(),
      shortId: z.string(),
      title: z.string(),
      permalink: z.string(),
    }),
  }),
  installation: z.object({ uuid: z.string() }).optional(),
})

/**
 * Verify a Sentry webhook signature. Sentry signs the raw request body with
 * an HMAC-SHA256 keyed by the integration's client secret and sends the hex
 * digest in the `Sentry-Hook-Signature` header.
 *
 * Empty / wrong-length signatures are rejected before reaching `timingSafeEqual`
 * — that primitive throws on mismatched buffer lengths.
 */
export function verifySentrySignature(rawBody: string, signature: string | null | undefined, secret: string): boolean {
  if (!signature || typeof signature !== 'string') return false
  const expected = createHmac('sha256', secret).update(rawBody, 'utf-8').digest('hex')
  if (signature.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(signature, 'utf-8'), Buffer.from(expected, 'utf-8'))
}

export function parseSentryEvent(input: unknown): ParseResult<SentryEvent> {
  if (input === null || typeof input !== 'object') {
    return { kind: 'error', message: 'payload must be an object' }
  }
  const parsed = SentryWebhookSchema.safeParse(input)
  if (!parsed.success) {
    return { kind: 'error', message: parsed.error.errors[0]?.message ?? 'invalid sentry payload' }
  }

  const tags: Record<string, string> = {}
  for (const [key, value] of parsed.data.data.event.tags) {
    tags[key] = value
  }

  return {
    kind: 'ok',
    value: {
      eventId: parsed.data.data.event.event_id,
      title: parsed.data.data.event.title,
      level: parsed.data.data.event.level,
      platform: parsed.data.data.event.platform,
      url: parsed.data.data.event.url,
      issueId: parsed.data.data.issue.id,
      shortId: parsed.data.data.issue.shortId,
      installationUuid: parsed.data.installation?.uuid ?? null,
      tags,
    },
  }
}
