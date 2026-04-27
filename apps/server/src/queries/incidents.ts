import { eq, and, desc, count, gte, lte } from 'drizzle-orm'
import { db, incidents, toolCalls, incidentActions } from '../db/client'

interface IncidentRow {
  id: string
  repo: string
  branch: string
  commit: string
  workflowName: string
  commitMessage: string | null
  workflowRunId: number | null
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
  metadata: unknown | null
  createdAt: Date
}

export async function listIncidents(
  orgId: string,
  limit: number,
  offset: number,
  repo?: string,
  fromDate?: Date | null,
  toDate?: Date | null,
): Promise<[IncidentRow[], { total: number }[]]> {
  const whereClause = and(
    repo ? and(eq(incidents.orgId, orgId), eq(incidents.repo, repo)) : eq(incidents.orgId, orgId),
    fromDate ? gte(incidents.triggeredAt, fromDate) : undefined,
    toDate ? lte(incidents.triggeredAt, toDate) : undefined,
  )

  const [rows, totals] = await Promise.all([
    db
      .select({
        id: incidents.id,
        repo: incidents.repo,
        branch: incidents.branch,
        commit: incidents.commit,
        workflowName: incidents.workflowName,
        commitMessage: incidents.commitMessage,
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
      .orderBy(desc(incidents.triggeredAt), desc(incidents.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(incidents).where(whereClause),
  ])
  return [rows, totals]
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
  const [calls, actions] = await Promise.all([
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
  ])
  return [calls, actions]
}

export async function findIncidentByPrUrl(
  prUrl: string,
  orgId: string,
): Promise<typeof incidents.$inferSelect | undefined> {
  return db.query.incidents.findFirst({
    where: (t, { and: a, eq: e }) => a(e(t.githubPrUrl, prUrl), e(t.orgId, orgId)),
  })
}

export async function findIncidentByRunId(
  orgId: string,
  repo: string,
  runId: number,
): Promise<typeof incidents.$inferSelect | undefined> {
  return db.query.incidents.findFirst({
    where: (t, { and: a, eq: e }) => a(e(t.orgId, orgId), e(t.repo, repo.toLowerCase()), e(t.workflowRunId, runId)),
  })
}

/** Find the most recent 'fixing' incident with a fix PR for this repo+branch — used for auto-resolve after CI passes. */
export async function findFixingIncidentForRepoBranch(
  repo: string,
  branch: string,
  orgId: string,
): Promise<typeof incidents.$inferSelect | undefined> {
  return db.query.incidents.findFirst({
    where: (t, { and: a, eq: e, isNotNull: n }) =>
      a(e(t.repo, repo), e(t.branch, branch), e(t.status, 'fixing'), n(t.githubPrUrl), e(t.orgId, orgId)),
    orderBy: (t, { desc: d }) => d(t.createdAt),
  })
}

export async function createIncident(values: {
  id: string
  orgId: string
  repo: string
  branch: string
  commit: string
  workflowName: string
  commitMessage?: string | null
  workflowRunId: number
  status: string
  triggeredAt: Date
}): Promise<typeof incidents.$inferSelect | null> {
  const [row] = await db
    .insert(incidents)
    .values(values)
    .onConflictDoNothing({ target: [incidents.orgId, incidents.workflowRunId] })
    .returning()
  return row ?? null
}
