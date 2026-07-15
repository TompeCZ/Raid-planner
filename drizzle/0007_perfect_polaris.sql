CREATE TYPE "public"."guild_rank" AS ENUM('GUILDMASTER', 'OFFICER', 'VETERAN', 'MEMBER', 'INITIATE', 'RECRUIT', 'ALT');--> statement-breakpoint
CREATE TYPE "public"."note_category" AS ENUM('PERFORMANCE', 'BEHAVIOR', 'ATTENDANCE', 'LOOT', 'RECRUITMENT', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."note_sentiment" AS ENUM('POSITIVE', 'NEUTRAL', 'CONCERN');--> statement-breakpoint
ALTER TYPE "public"."note_visibility" ADD VALUE IF NOT EXISTS 'PRIVATE';--> statement-breakpoint
CREATE TABLE "note_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"edited_by" uuid NOT NULL,
	"edited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"previous_body" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "note" DROP CONSTRAINT "note_target_id_required";--> statement-breakpoint
DROP INDEX "note_target_idx";--> statement-breakpoint
ALTER TABLE "note" ADD COLUMN "subject_user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "note" ADD COLUMN "character_id" uuid;--> statement-breakpoint
ALTER TABLE "note" ADD COLUMN "raid_id" uuid;--> statement-breakpoint
ALTER TABLE "note" ADD COLUMN "category" "note_category" DEFAULT 'OTHER' NOT NULL;--> statement-breakpoint
ALTER TABLE "note" ADD COLUMN "sentiment" "note_sentiment" DEFAULT 'NEUTRAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "note" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "note" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "guild_rank" "guild_rank";--> statement-breakpoint
ALTER TABLE "note_revision" ADD CONSTRAINT "note_revision_note_id_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_revision" ADD CONSTRAINT "note_revision_edited_by_user_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_revision_note_idx" ON "note_revision" USING btree ("note_id","edited_at");--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_subject_user_id_user_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_raid_id_raid_id_fk" FOREIGN KEY ("raid_id") REFERENCES "public"."raid"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_character_subject_fk" FOREIGN KEY ("character_id","subject_user_id") REFERENCES "public"."character"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_subject_idx" ON "note" USING btree ("subject_user_id","created_at");--> statement-breakpoint
CREATE INDEX "note_raid_idx" ON "note" USING btree ("raid_id");--> statement-breakpoint
CREATE INDEX "note_author_idx" ON "note" USING btree ("author_id");--> statement-breakpoint
ALTER TABLE "note" DROP COLUMN "target_type";--> statement-breakpoint
ALTER TABLE "note" DROP COLUMN "target_id";--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_body_not_blank" CHECK (length(btrim("note"."body")) > 0);--> statement-breakpoint
DROP TYPE "public"."note_target_type";