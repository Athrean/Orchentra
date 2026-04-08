CREATE TABLE "incident_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"incident_id" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"next_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "incident_jobs" ADD CONSTRAINT "incident_jobs_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "incident_jobs_incident_id_idx" ON "incident_jobs" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "incident_jobs_claimable_idx" ON "incident_jobs" USING btree ("status","next_run_at");