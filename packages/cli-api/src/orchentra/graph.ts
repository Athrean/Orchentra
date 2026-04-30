export interface GraphNodeDto {
  readonly id: string
  readonly parentNodeId: string | null
  readonly kind: string
  readonly integration: string
  readonly round: number
  readonly durationMs: number | null
  readonly argsJson: string | null
  readonly resultJson: string | null
  readonly createdAt: string
}

export interface ExecutionGraphResponse {
  readonly executionId: string
  readonly nodes: readonly GraphNodeDto[]
}

export interface NodeLineageResponse {
  readonly node: GraphNodeDto
  readonly ancestors: readonly GraphNodeDto[]
}

export class GraphHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'GraphHttpError'
  }
}

interface FetchOptions {
  readonly serverUrl: string
  readonly orgId: string
  readonly apiKey: string
  readonly signal?: AbortSignal
}

export interface FetchExecutionGraphOptions extends FetchOptions {
  readonly executionId: string
}

export interface FetchNodeLineageOptions extends FetchOptions {
  readonly nodeId: string
}

export async function fetchExecutionGraph(opts: FetchExecutionGraphOptions): Promise<ExecutionGraphResponse> {
  const base = opts.serverUrl.replace(/\/+$/, '')
  const url = `${base}/api/orgs/${encodeURIComponent(opts.orgId)}/executions/${encodeURIComponent(opts.executionId)}/graph`
  return doGet<ExecutionGraphResponse>(url, opts)
}

export async function fetchNodeLineage(opts: FetchNodeLineageOptions): Promise<NodeLineageResponse> {
  const base = opts.serverUrl.replace(/\/+$/, '')
  const url = `${base}/api/orgs/${encodeURIComponent(opts.orgId)}/nodes/${encodeURIComponent(opts.nodeId)}/lineage`
  return doGet<NodeLineageResponse>(url, opts)
}

async function doGet<T>(url: string, opts: FetchOptions): Promise<T> {
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${opts.apiKey}`,
      accept: 'application/json',
    },
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
    throw new GraphHttpError(res.status, `${res.status} ${detail}`)
  }

  return (await res.json()) as T
}
