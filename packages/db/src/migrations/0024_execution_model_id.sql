-- Persist the model used for execution-level token/cost accounting.
-- Existing rows stay NULL and are surfaced as "unknown" by read clients.

ALTER TABLE "executions"
  ADD COLUMN IF NOT EXISTS "model_id" text;

CREATE INDEX IF NOT EXISTS "executions_model_id_idx"
  ON "executions" ("model_id");
