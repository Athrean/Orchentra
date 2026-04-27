-- Phase 1 of the execution-graph repositioning. Renames the incident-centric
-- tables to executions/nodes and introduces the kind / root_node_id /
-- parent_node_id columns that turn the existing flat structure into a DAG.
-- Postgres preserves indexes, FKs, and grants across ALTER TABLE RENAME.

ALTER TABLE "incidents" RENAME TO "executions";
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'ci_failure';
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "root_node_id" text;
CREATE INDEX IF NOT EXISTS "executions_kind_idx" ON "executions" ("kind");

ALTER TABLE "tool_calls" RENAME TO "nodes";
ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "parent_node_id" text;
ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'tool_call';
