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
CREATE INDEX "incidents_org_id_idx" ON "incidents" USING btree ("org_id");--> statement-breakpoint
-- Step 4: add cascade delete to child tables so org deletion doesn't raise FK violations
ALTER TABLE "incident_actions" DROP CONSTRAINT "incident_actions_incident_id_incidents_id_fk";--> statement-breakpoint
ALTER TABLE "tool_calls" DROP CONSTRAINT "tool_calls_incident_id_incidents_id_fk";--> statement-breakpoint
ALTER TABLE "incident_actions" ADD CONSTRAINT "incident_actions_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Step 5: make workflowRunId unique per org so multiple orgs can monitor same repo
DROP INDEX "incidents_workflow_run_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "incidents_workflow_run_id_idx" ON "incidents" USING btree ("org_id","workflow_run_id");
