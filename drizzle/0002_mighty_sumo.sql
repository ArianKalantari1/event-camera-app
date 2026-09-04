ALTER TABLE "events" ADD COLUMN "retention_warned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "purged_at" timestamp with time zone;