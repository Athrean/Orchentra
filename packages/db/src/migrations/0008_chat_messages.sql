CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "session_id" text NOT NULL,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "chat_messages_org_session_created_idx" ON "chat_messages" ("org_id", "session_id", "created_at");
