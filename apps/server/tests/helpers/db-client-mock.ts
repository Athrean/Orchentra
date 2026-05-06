/**
 * Bun's mock.module is process-global. A partial '../src/db/client' mock
 * leaks into other test files — when their transitively-loaded code
 * imports an export the partial mock didn't include, link-time fails
 * with "Export named X not found in module .../src/db/client.ts".
 *
 * Each test that mocks db/client should spread `dbClientMockBase()` and
 * override only what it actually drives, so unused exports stay defined.
 */
export function dbClientMockBase(): Record<string, unknown> {
  const noopChain = {
    insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: async () => [] }) }) }),
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [], orderBy: () => ({ limit: async () => [] }) }),
        innerJoin: () => ({ where: () => ({ limit: async () => [] }) }),
        groupBy: async () => [],
      }),
    }),
    update: () => ({ set: () => ({ where: async () => [] }) }),
    delete: () => ({ where: async () => [] }),
    execute: async () => [],
    query: {},
  }
  return {
    db: noopChain,
    runMigrations: async () => {},
    executions: {},
    nodes: {},
    incidents: {},
    toolCalls: {},
    resolvedPatterns: {},
    incidentActions: {},
    users: {},
    sessions: {},
    apiKeys: {},
    monitoredRepos: {},
    organizations: {},
    orgMembers: {},
    chatMessages: {},
    webhookEvents: {},
    incidentJobs: {},
    orgLlmConfigs: {},
    credentials: {},
    auditLog: {},
    githubInstallations: {},
  }
}
