-- Add token usage and cost tracking columns to incidents table
ALTER TABLE "incidents"
  ADD COLUMN IF NOT EXISTS "token_inputs" integer,
  ADD COLUMN IF NOT EXISTS "token_outputs" integer,
  ADD COLUMN IF NOT EXISTS "estimated_cost_usd" double precision;
