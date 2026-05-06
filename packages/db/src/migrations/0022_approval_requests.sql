-- Slice 6 — pending approval requests for write/destructive ops invoked
-- over the MCP HTTP transport. The dispatcher persists a row here when the
-- approval gate cannot resolve synchronously; the human acks via
-- POST /api/approvals/:id/ack, which flips status and unblocks the suspended
-- awaitApproval poll on the server.
--
-- See packages/operations/src/trust.ts for the trust-class enum and
-- apps/server/src/approvals/store.ts for the swappable store interface.

CREATE TABLE IF NOT EXISTS "approval_requests" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "operation_id" text NOT NULL,
  "trust_class" text NOT NULL,
  "input" jsonb NOT NULL,
  "requested_by" jsonb NOT NULL,
  "requested_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "decided_by" jsonb,
  "decided_at" timestamp with time zone,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS "approval_requests_org_status_idx"
  ON "approval_requests" ("org_id", "status");
CREATE INDEX IF NOT EXISTS "approval_requests_expires_at_idx"
  ON "approval_requests" ("expires_at");
