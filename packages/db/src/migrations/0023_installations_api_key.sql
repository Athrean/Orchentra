-- CLI bootstrap apiKey columns. Slice 1 of PRD #374.
--
-- The Orchentra apiKey is minted server-side at GitHub App install / configure
-- time (callback handler in apps/server/src/routes/github-app.ts). The plaintext
-- is returned exactly once via a localhost loopback redirect to the CLI; what
-- we persist here is its SHA-256 hash (hex, 64 chars). Re-bootstrap rotates
-- both columns. Existing rows backfill NULL — they will pick up an apiKey the
-- next time the user runs `orchentra init`.

ALTER TABLE "github_installations"
  ADD COLUMN "api_key_hash" text,
  ADD COLUMN "api_key_issued_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "github_installations_api_key_hash_idx"
  ON "github_installations" ("api_key_hash");
