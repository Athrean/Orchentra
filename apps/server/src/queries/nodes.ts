import { and, eq, asc } from 'drizzle-orm'
import { db, executions, nodes } from '../db/client'

export interface GraphNodeRow {
  id: string
  parentNodeId: string | null
  kind: string
  integration: string
  round: number
  durationMs: number | null
  argsJson: string | null
  resultJson: string | null
  createdAt: Date
}

export interface NodeLineage {
  node: GraphNodeRow
  ancestors: GraphNodeRow[]
}

export interface ExecutionMeta {
  id: string
  kind: string
  status: string
  repo: string
  branch: string
  triggeredAt: Date | null
  mttrSeconds: number | null
  createdAt: Date
}

export interface ExecutionGraph {
  execution: ExecutionMeta
  nodes: GraphNodeRow[]
}

const NODE_COLUMNS = {
  id: nodes.id,
  parentNodeId: nodes.parentNodeId,
  kind: nodes.kind,
  integration: nodes.integration,
  round: nodes.round,
  durationMs: nodes.durationMs,
  argsJson: nodes.argsJson,
  resultJson: nodes.resultJson,
  createdAt: nodes.createdAt,
} as const

const EXECUTION_META_COLUMNS = {
  id: executions.id,
  kind: executions.kind,
  status: executions.status,
  repo: executions.repo,
  branch: executions.branch,
  triggeredAt: executions.triggeredAt,
  mttrSeconds: executions.mttrSeconds,
  createdAt: executions.createdAt,
} as const

export async function getExecutionGraph(executionId: string, orgId: string): Promise<ExecutionGraph | null> {
  const exec = await db
    .select(EXECUTION_META_COLUMNS)
    .from(executions)
    .where(and(eq(executions.id, executionId), eq(executions.orgId, orgId)))
    .limit(1)
  if (exec.length === 0) return null

  const nodeRows = await db
    .select(NODE_COLUMNS)
    .from(nodes)
    .where(eq(nodes.incidentId, executionId))
    .orderBy(asc(nodes.round), asc(nodes.createdAt))

  return { execution: exec[0]!, nodes: nodeRows }
}

export async function getNodeLineage(nodeId: string, orgId: string): Promise<NodeLineage | null> {
  const nodeRows = await db
    .select({ ...NODE_COLUMNS, incidentId: nodes.incidentId })
    .from(nodes)
    .where(eq(nodes.id, nodeId))
    .limit(1)
  if (nodeRows.length === 0) return null
  const { incidentId: executionId, ...node } = nodeRows[0]!
  if (!executionId) return null

  const exec = await db
    .select({ id: executions.id })
    .from(executions)
    .where(and(eq(executions.id, executionId), eq(executions.orgId, orgId)))
    .limit(1)
  if (exec.length === 0) return null

  const allNodes = await db.select(NODE_COLUMNS).from(nodes).where(eq(nodes.incidentId, executionId))

  const byId = new Map(allNodes.map((n) => [n.id, n]))
  const ancestors: GraphNodeRow[] = []
  let cur: GraphNodeRow = node
  const seen = new Set<string>([node.id])
  while (cur.parentNodeId) {
    if (seen.has(cur.parentNodeId)) break
    const parent = byId.get(cur.parentNodeId)
    if (!parent) break
    ancestors.unshift(parent)
    seen.add(parent.id)
    cur = parent
  }

  return { node, ancestors }
}
