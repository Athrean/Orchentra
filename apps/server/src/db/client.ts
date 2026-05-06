export { db, runMigrations } from '@orchentra/db'
export {
  // graph primitives (canonical)
  executions,
  nodes,
  // legacy aliases — same tables, kept until consumers migrate
  incidents,
  toolCalls,
  resolvedPatterns,
  incidentActions,
  users,
  sessions,
  apiKeys,
  monitoredRepos,
  organizations,
  orgMembers,
  chatMessages,
  webhookEvents,
  incidentJobs,
  orgLlmConfigs,
  // Slice 2 — credential vault, audit trail, per-org install state.
  credentials,
  auditLog,
  githubInstallations,
  // Slice 6 — pending approval requests for write/destructive ops.
  approvalRequests,
} from '@orchentra/db'
