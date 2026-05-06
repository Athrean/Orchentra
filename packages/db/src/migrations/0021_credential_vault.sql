-- Slice 2 — credential vault, audit trail, and per-org GitHub install state.
-- See ORCHENTRA_PLAN.md §3.3.5 (Auth & Credential Vault) and §3.4 (data model).
--
-- credentials: opaque encrypted_value column owned by apps/server/src/vault/.
-- audit_log: append-only trail; metadata MUST be redacted by the writer.
-- github_installations: populated by Slice 3 install callback; read by
--   getOctokitForInstall(orgId).

CREATE TABLE IF NOT EXISTS "credentials" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "encrypted_value" text NOT NULL,
  "scopes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "expires_at" timestamp with time zone,
  "rotated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "credentials_org_kind_unique" ON "credentials" ("org_id", "kind");
CREATE INDEX IF NOT EXISTS "credentials_org_id_idx" ON "credentials" ("org_id");

CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "actor" jsonb NOT NULL,
  "action" text NOT NULL,
  "resource" jsonb,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "audit_log_org_id_idx" ON "audit_log" ("org_id");
CREATE INDEX IF NOT EXISTS "audit_log_action_idx" ON "audit_log" ("action");
CREATE INDEX IF NOT EXISTS "audit_log_org_created_idx" ON "audit_log" ("org_id", "created_at");

CREATE TABLE IF NOT EXISTS "github_installations" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "installation_id" bigint NOT NULL,
  "account_login" text NOT NULL,
  "account_type" text NOT NULL,
  "repository_selection" text NOT NULL,
  "permissions" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "events" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "installed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "suspended_at" timestamp with time zone
);
CREATE UNIQUE INDEX IF NOT EXISTS "github_installations_installation_id_unique"
  ON "github_installations" ("installation_id");
CREATE INDEX IF NOT EXISTS "github_installations_org_id_idx" ON "github_installations" ("org_id");
