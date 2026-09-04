CREATE TYPE "public"."report_reason" AS ENUM('in_photo', 'inappropriate', 'wrong_event', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_state" AS ENUM('open', 'actioned', 'dismissed');--> statement-breakpoint
CREATE TABLE "media_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"session_id" uuid,
	"reason" "report_reason" NOT NULL,
	"detail" text,
	"state" "report_state" DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_reports" ADD CONSTRAINT "media_reports_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_reports" ADD CONSTRAINT "media_reports_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_reports" ADD CONSTRAINT "media_reports_session_id_event_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."event_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_reports_event_state_idx" ON "media_reports" USING btree ("event_id","state","created_at");--> statement-breakpoint
CREATE INDEX "media_reports_media_idx" ON "media_reports" USING btree ("media_id");