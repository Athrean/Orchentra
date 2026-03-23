CREATE TABLE "incidents" (
	"id" text PRIMARY KEY NOT NULL,
	"repo" text NOT NULL,
	"branch" text NOT NULL,
	"commit" text NOT NULL,
	"workflow_name" text NOT NULL,
	"workflow_run_id" integer,
	"failed_step" text,
	"status" text DEFAULT 'investigating' NOT NULL,
	"brief_json" text,
	"confidence" double precision,
	"root_cause" text,
	"suggested_fix" text,
	"slack_channel" text,
	"slack_message_ts" text,
	"triggered_at" timestamp,
	"resolved_at" timestamp,
	"mttr_seconds" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resolved_patterns" (
	"id" text PRIMARY KEY NOT NULL,
	"incident_id" text,
	"embedding" text,
	"pattern" text,
	"resolution" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"incident_id" text,
	"integration" text NOT NULL,
	"round" integer NOT NULL,
	"duration_ms" integer,
	"result_json" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resolved_patterns" ADD CONSTRAINT "resolved_patterns_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;