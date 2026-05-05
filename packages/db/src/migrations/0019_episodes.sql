-- Phase 2 brain skeleton — append-only "what happened" log per execution.
-- An episode references the originating execution so a reader can join back
-- to the full node graph when the summary alone is not enough.

CREATE TABLE IF NOT EXISTS "episodes" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "execution_id" text NOT NULL REFERENCES "executions"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "summary" text NOT NULL,
  "ops_called" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "outcome" text NOT NULL DEFAULT 'unknown',
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "episodes_org_id_idx" ON "episodes" ("org_id");
CREATE INDEX IF NOT EXISTS "episodes_execution_id_idx" ON "episodes" ("execution_id");
CREATE INDEX IF NOT EXISTS "episodes_kind_idx" ON "episodes" ("kind");
