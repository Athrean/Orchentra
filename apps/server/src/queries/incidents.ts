import { eq, and, desc, count } from 'drizzle-orm'
import { db, incidents, toolCalls, incidentActions } from '../db/client'

interface IncidentRow {
  id: string
  repo: string
  branch: string
  commit: string
  workflowName: string
  workflowRunId: number
  failedStep: string | null
  status: string
  confidence: number | null
  rootCause: string | null
  triggeredAt: Date | null
  createdAt: Date
}

interface ToolCallRow {
  id: string
  integration: string
  round: number
  durationMs: number | null
  createdAt: Date
}

interface ActionRow {
  id: string
  incidentId: string
  actionType: string
  performedBy: string | null
  metadata: Record<string, unknown> | null
  createdAt: Date
}

export async function listIncidents(
  orgId: string,
  limit: number,
  offset: number,
  repo?: string,
): Promise<[IncidentRow[], [{ total: number }]]> {
  const whereClause = repo ? and(eq(incidents.orgId, orgId), eq(incidents.repo, repo)) : eq(incidents.orgId, orgId)

  return Promise.all([
    db
      .select({
        id: incidents.id,
        repo: incidents.repo,
        branch: incidents.branch,
        commit: incidents.commit,
        workflowName: incidents.workflowName,
        workflowRunId: incidents.workflowRunId,
        failedStep: incidents.failedStep,
        status: incidents.status,
        confidence: incidents.confidence,
        rootCause: incidents.rootCause,
        triggeredAt: incidents.triggeredAt,
        createdAt: incidents.createdAt,
      })
      .from(incidents)
      .where(whereClause)
      .orderBy(desc(incidents.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(incidents).where(whereClause),
  ]) as Promise<[IncidentRow[], [{ total: number }]]>
}

export async function findIncident(id: string, orgId: string): Promise<typeof incidents.$inferSelect | undefined> {
  return db.query.incidents.findFirst({
    where: (t, { and: a, eq: e }) => a(e(t.id, id), e(t.orgId, orgId)),
  })
}

/** Lightweight ownership check — returns { id } if the incident belongs to the org, else null. */
export async function findIncidentForOrg(id: string, orgId: string): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: incidents.id })
    .from(incidents)
    .where(and(eq(incidents.id, id), eq(incidents.orgId, orgId)))
    .limit(1)
  return row ?? null
}

export async function getIncidentRelations(id: string): Promise<[ToolCallRow[], ActionRow[]]> {
  return Promise.all([
    db
      .select({
        id: toolCalls.id,
        integration: toolCalls.integration,
        round: toolCalls.round,
        durationMs: toolCalls.durationMs,
        createdAt: toolCalls.createdAt,
      })
      .from(toolCalls)
      .where(eq(toolCalls.incidentId, id)),
    db
      .select({
        id: incidentActions.id,
        incidentId: incidentActions.incidentId,
        actionType: incidentActions.actionType,
        performedBy: incidentActions.performedBy,
        metadata: incidentActions.metadata,
        createdAt: incidentActions.createdAt,
      })
      .from(incidentActions)
      .where(eq(incidentActions.incidentId, id))
      .orderBy(desc(incidentActions.createdAt)),
  ]) as Promise<[ToolCallRow[], ActionRow[]]>
}
