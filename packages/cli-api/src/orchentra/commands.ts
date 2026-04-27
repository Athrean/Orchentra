/**
 * Client for the Orchentra server's slash-command surface
 * (`POST /api/orgs/:orgId/commands`). Streams text chunks from the
 * response body and yields them as strings.
 */

export interface PostSlashCommandOptions {
  readonly serverUrl: string
  readonly orgId: string
  readonly apiKey: string
  readonly command: string
  readonly args: readonly string[]
  readonly sessionId: string
  readonly signal?: AbortSignal
}

export class CommandHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'CommandHttpError'
  }
}

export async function* postSlashCommand(opts: PostSlashCommandOptions): AsyncIterable<string> {
  const base = opts.serverUrl.replace(/\/+$/, '')
  const url = `${base}/api/orgs/${encodeURIComponent(opts.orgId)}/commands`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${opts.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      command: opts.command,
      args: [...opts.args],
      sessionId: opts.sessionId,
    }),
    signal: opts.signal,
  })

  if (!res.ok) {
    let detail = res.statusText
    try {
      const parsed = (await res.json()) as { error?: string }
      if (parsed?.error) detail = parsed.error
    } catch {
      /* body not JSON — keep statusText */
    }
    throw new CommandHttpError(res.status, `${res.status} ${detail}`)
  }

  const body = res.body
  if (!body) return

  const reader = body.getReader()
  const decoder = new TextDecoder()
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      if (value && value.length > 0) {
        const text = decoder.decode(value, { stream: true })
        if (text.length > 0) yield text
      }
    }
    const tail = decoder.decode()
    if (tail.length > 0) yield tail
  } finally {
    try {
      reader.releaseLock()
    } catch {
      /* ignore */
    }
  }
}
