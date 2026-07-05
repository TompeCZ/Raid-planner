ALTER TABLE "raid" ADD COLUMN "discord_announcement_message_id" text;--> statement-breakpoint
ALTER TABLE "raid" ADD COLUMN "discord_setup_message_id" text;--> statement-breakpoint
ALTER TABLE "raid" ADD COLUMN "discord_setup_snapshot" jsonb;