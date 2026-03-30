ALTER TABLE "monitored_repos" DROP CONSTRAINT "monitored_repos_repo_unique";--> statement-breakpoint
-- Step 1: add column as nullable to avoid failing on existing rows
ALTER TABLE "monitored_repos" ADD COLUMN "org_id" text;--> statement-breakpoint
-- Step 2: remove rows that cannot be assigned an org (orphaned pre-migration rows)
DELETE FROM "monitored_repos" WHERE "org_id" IS NULL;--> statement-breakpoint
-- Step 3: enforce NOT NULL now that all rows have a value
ALTER TABLE "monitored_repos" ALTER COLUMN "org_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "monitored_repos" ADD CONSTRAINT "monitored_repos_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "monitored_repos_org_repo_unique" ON "monitored_repos" USING btree ("org_id","repo");
