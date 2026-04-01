import { tool } from 'ai'
import { z } from 'zod'
import { db, incidents, monitoredRepos } from '../../db/client'
import { eq, and, desc, ilike, or } from 'drizzle-orm'

/**
 * Factory that creates the chat agent toolset with the org context closed over.
 * All tools are scoped to the given orgId so they cannot leak cross-org data.
 */
export function createChatTools(orgId: string): ReturnType<typeof buildChatTools> {
  return buildChatTools(orgId)
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function buildChatTools(orgId: string) {
  /** List recent incidents for the org, optionally filtered by repo or status. */
  const listIncidents = tool({
    description:
      'List recent incidents for this org. Use to answer questions like "what failed this week?" or "show me open incidents in the auth repo".',
    parameters: z.object({
      repo: z.string().optional().describe('Filter to a specific repo (owner/name). Omit for all repos.'),
      status: z
        .enum(['investigating', 'fixing', 'resolved', 'dismissed', 'snoozed'])
        .optional()
        .describe('Filter by incident status. Omit for all statuses.'),
      limit: z.number().int().min(1).max(20).default(10).describe('Max number of incidents to return (1-20).'),
    }),
    execute: async ({ repo, status, limit }) => {
      const conditions = [eq(incidents.orgId, orgId)]
      if (repo) conditions.push(eq(incidents.repo, repo.toLowerCase()))
      if (status) conditions.push(eq(incidents.status, status))

      const rows = await db
        .select({
          id: incidents.id,
          repo: incidents.repo,
          branch: incidents.branch,
          workflowName: incidents.workflowName,
          failedStep: incidents.failedStep,
          status: incidents.status,
          confidence: incidents.confidence,
          rootCause: incidents.rootCause,
          triggeredAt: incidents.triggeredAt,
        })
        .from(incidents)
        .where(and(...conditions))
        .orderBy(desc(incidents.triggeredAt))
        .limit(limit)

      return { incidents: rows, count: rows.length }
    },
  })

  /** Get full detail for a single incident by ID. */
  const getIncident = tool({
    description: 'Get full details for a specific incident by its ID, including root cause and suggested fix.',
    parameters: z.object({
      incidentId: z.string().describe('The incident ID (UUID).'),
    }),
    execute: async ({ incidentId }) => {
      const incident = await db.query.incidents.findFirst({
        where: (t, { and: a, eq: e }) => a(e(t.id, incidentId), e(t.orgId, orgId)),
      })
      if (!incident) return { error: `Incident ${incidentId} not found` }
      return { incident }
    },
  })

  /** Search incidents by keyword in root cause or commit message. */
  const searchIncidents = tool({
    description:
      'Search incidents by keyword in root cause, failed step, or commit message. Useful for "show me flaky test failures" or "find npm install errors".',
    parameters: z.object({
      query: z.string().describe('Search term to match against root cause, failed step, and commit message.'),
      limit: z.number().int().min(1).max(20).default(10),
    }),
    execute: async ({ query, limit }) => {
      const term = `%${query}%`
      const rows = await db
        .select({
          id: incidents.id,
          repo: incidents.repo,
          branch: incidents.branch,
          workflowName: incidents.workflowName,
          failedStep: incidents.failedStep,
          status: incidents.status,
          rootCause: incidents.rootCause,
          triggeredAt: incidents.triggeredAt,
        })
        .from(incidents)
        .where(
          and(
            eq(incidents.orgId, orgId),
            or(
              ilike(incidents.rootCause, term),
              ilike(incidents.failedStep, term),
              ilike(incidents.commitMessage, term),
            ),
          ),
        )
        .orderBy(desc(incidents.triggeredAt))
        .limit(limit)

      return { incidents: rows, count: rows.length }
    },
  })

  /** List monitored repos for the org. */
  const listRepos = tool({
    description: 'List all repos currently monitored by this org.',
    parameters: z.object({}),
    execute: async () => {
      const repos = await db
        .select({ repo: monitoredRepos.repo })
        .from(monitoredRepos)
        .where(eq(monitoredRepos.orgId, orgId))
      return { repos: repos.map((r) => r.repo) }
    },
  })

  return { listIncidents, getIncident, searchIncidents, listRepos }
}
