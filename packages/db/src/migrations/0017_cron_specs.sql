-- Cron specs storage. Orgs schedule recurring skill runs here; a scheduler
-- tick (Phase 2 follow-up) reads due rows and spawns kind='cron' executions.

CREATE TABLE IF NOT EXISTS "cron_specs" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "skill_name" text NOT NULL,
  "cron_expr" text NOT NULL,
  "last_ticked_at" timestamp with time zone,
  "enabled" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "cron_specs_org_skill_idx" ON "cron_specs" ("org_id", "skill_name");
CREATE INDEX IF NOT EXISTS "cron_specs_enabled_idx" ON "cron_specs" ("enabled");
