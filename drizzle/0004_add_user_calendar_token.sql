ALTER TABLE "user" ADD COLUMN "calendar_token" uuid;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_calendar_token_unique" UNIQUE("calendar_token");