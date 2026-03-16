import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core"

export const incidents = sqliteTable("incidents", {
  id: text("id").primaryKey(),
  repo: text("repo").notNull(),
  branch: text("branch").notNull(),
  commit: text("commit").notNull(),
  workflowName: text("workflow_name").notNull(),
  workflowRunId: integer("workflow_run_id"),
  failedStep: text("failed_step"),
  status: text("status").notNull().default("investigating"),

  // LLM output
  briefJson: text("brief_json"),
  confidence: real("confidence"),
  rootCause: text("root_cause"),
  suggestedFix: text("suggested_fix"),

  // Slack
  slackChannel: text("slack_channel"),
  slackMessageTs: text("slack_message_ts"),

  // Timing
  triggeredAt: integer("triggered_at", { mode: "timestamp" }),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  mttrSeconds: integer("mttr_seconds"),

  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})

export const toolCalls = sqliteTable("tool_calls", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id").references(() => incidents.id),
  integration: text("integration").notNull(),
  round: integer("round").notNull(),
  durationMs: integer("duration_ms"),
  resultJson: text("result_json"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})

export const resolvedPatterns = sqliteTable("resolved_patterns", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id").references(() => incidents.id),
  embedding: text("embedding"),
  pattern: text("pattern"),
  resolution: text("resolution"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})
