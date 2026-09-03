CREATE TYPE "public"."actor_type" AS ENUM('organizer', 'attendee', 'system');--> statement-breakpoint
CREATE TYPE "public"."event_lifecycle" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."media_state" AS ENUM('awaiting_upload', 'pending', 'approved', 'rejected', 'removed');--> statement-breakpoint
CREATE TYPE "public"."resource_kind" AS ENUM('action', 'resource', 'schedule', 'note');--> statement-breakpoint
CREATE TYPE "public"."resource_visibility" AS ENUM('public', 'attendee', 'organizer');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"kind" "resource_kind" DEFAULT 'resource' NOT NULL,
	"label" text NOT NULL,
	"detail" text,
	"url" text,
	"starts_at" timestamp with time zone,
	"visibility" "resource_visibility" DEFAULT 'attendee' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"display_name" text,
	"team" text,
	"linkedin_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"location" text,
	"banner_key" text,
	"contact_name" text,
	"contact_email" text,
	"lifecycle" "event_lifecycle" DEFAULT 'draft' NOT NULL,
	"code_hash" text,
	"code_rotated_at" timestamp with time zone,
	"uploads_open_at" timestamp with time zone,
	"uploads_close_at" timestamp with time zone,
	"gallery_open_at" timestamp with time zone,
	"gallery_close_at" timestamp with time zone,
	"retention_until" timestamp with time zone,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"session_id" uuid,
	"storage_key" text NOT NULL,
	"original_filename" text,
	"mime" text NOT NULL,
	"bytes" integer,
	"width" integer,
	"height" integer,
	"state" "media_state" DEFAULT 'awaiting_upload' NOT NULL,
	"moderated_by" text,
	"moderated_at" timestamp with time zone,
	"reject_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_resources" ADD CONSTRAINT "event_resources_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sessions" ADD CONSTRAINT "event_sessions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_session_id_event_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."event_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_event_created_idx" ON "audit_events" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE INDEX "event_resources_event_sort_idx" ON "event_resources" USING btree ("event_id","sort");--> statement-breakpoint
CREATE UNIQUE INDEX "event_sessions_token_key" ON "event_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "event_sessions_event_idx" ON "event_sessions" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "events_slug_key" ON "events" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "media_assets_event_state_idx" ON "media_assets" USING btree ("event_id","state","created_at");--> statement-breakpoint
CREATE INDEX "media_assets_session_idx" ON "media_assets" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_storage_key_key" ON "media_assets" USING btree ("storage_key");