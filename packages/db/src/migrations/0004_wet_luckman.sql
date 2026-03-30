-- Step 1: add columns as nullable to avoid failing on existing rows
ALTER TABLE "incidents" ADD COLUMN "org_id" text;--> statement-breakpoint
ALTER TABLE "resolved_patterns" ADD COLUMN "org_id" text;--> statement-breakpoint
-- Step 2: remove orphaned rows that cannot be assigned an org
DELETE FROM "incidents" WHERE "org_id" IS NULL;--> statement-breakpoint
DELETE FROM "resolved_patterns" WHERE "org_id" IS NULL;--> statement-breakpoint
-- Step 3: enforce NOT NULL now that all rows have a value
ALTER TABLE "incidents" ALTER COLUMN "org_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "resolved_patterns" ALTER COLUMN "org_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolved_patterns" ADD CONSTRAINT "resolved_patterns_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incidents_org_id_idx" ON "incidents" USING btree ("org_id");
