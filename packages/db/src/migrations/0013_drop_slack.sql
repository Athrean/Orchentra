ALTER TABLE "incidents" DROP COLUMN IF EXISTS "slack_channel";--> statement-breakpoint
ALTER TABLE "incidents" DROP COLUMN IF EXISTS "slack_message_ts";
