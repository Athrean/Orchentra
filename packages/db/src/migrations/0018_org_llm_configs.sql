CREATE TABLE IF NOT EXISTS "org_llm_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"provider" text DEFAULT 'openrouter' NOT NULL,
	"model_id" text NOT NULL,
	"api_key_ciphertext" text,
	"api_key_iv" text,
	"api_key_tag" text,
	"base_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_llm_configs_org_id_unique" UNIQUE("org_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "org_llm_configs" ADD CONSTRAINT "org_llm_configs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
