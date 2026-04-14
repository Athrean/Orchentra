ALTER TABLE "incidents" ADD COLUMN "github_check_run_id" bigint;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "github_triage_comment_ids" jsonb;