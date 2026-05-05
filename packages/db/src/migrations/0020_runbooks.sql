-- Phase 2 brain skeleton — distilled patterns ("runbooks") plus a join table
-- that pins each runbook under one or more SKILL.md skill names. Body is
-- human-readable Markdown rendered into a SKILL.md document on export.

CREATE TABLE IF NOT EXISTS "runbooks" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "triggers" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "ops_used" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "body" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "runbooks_org_name_unique" ON "runbooks" ("org_id", "name");
CREATE INDEX IF NOT EXISTS "runbooks_org_id_idx" ON "runbooks" ("org_id");

CREATE TABLE IF NOT EXISTS "runbook_skills" (
  "runbook_id" text NOT NULL REFERENCES "runbooks"("id") ON DELETE CASCADE,
  "skill_name" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("runbook_id", "skill_name")
);
CREATE INDEX IF NOT EXISTS "runbook_skills_skill_name_idx" ON "runbook_skills" ("skill_name");
