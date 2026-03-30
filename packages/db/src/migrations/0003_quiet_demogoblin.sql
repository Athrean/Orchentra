ALTER TABLE "monitored_repos" ADD COLUMN "org_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "monitored_repos" ADD CONSTRAINT "monitored_repos_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "monitored_repos_org_id_idx" ON "monitored_repos" USING btree ("org_id");