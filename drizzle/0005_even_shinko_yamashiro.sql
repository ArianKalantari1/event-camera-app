ALTER TABLE "event_sessions" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizer_sessions" ADD COLUMN "expires_at" timestamp with time zone;