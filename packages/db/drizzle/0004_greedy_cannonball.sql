CREATE TYPE "public"."codex_visibility" AS ENUM('private', 'shared', 'public');--> statement-breakpoint
CREATE TABLE "codex_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"system_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"type" text NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"entity_key" text,
	"visibility" "codex_visibility" DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "codex_system_key_unique" UNIQUE("system_id","key")
);
--> statement-breakpoint
ALTER TABLE "codex_entries" ADD CONSTRAINT "codex_entries_system_id_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codex_entries" ADD CONSTRAINT "codex_entries_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "codex_system_type_idx" ON "codex_entries" USING btree ("system_id","type");--> statement-breakpoint
CREATE INDEX "codex_owner_idx" ON "codex_entries" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "codex_links_gin_idx" ON "codex_entries" USING gin ("links");