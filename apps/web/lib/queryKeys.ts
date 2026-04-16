export const queryKeys = {
  me: ['me'] as const,
  repos: (orgId: string) => ['repos', orgId] as const,
  incidents: (orgId: string, repo: string, from?: string, to?: string) => ['incidents', orgId, repo, from, to] as const,
  incidentDetail: (orgId: string, id: string) => ['incident', orgId, id] as const,
  workflows: (orgId: string, repo: string) => ['workflows', orgId, repo] as const,
  workflowRuns: (orgId: string, repo: string, workflowId: number) =>
    ['workflow-runs', orgId, repo, workflowId] as const,
  analytics: (orgId: string, repo: string, from: string, to: string) => ['analytics', orgId, repo, from, to] as const,
}
