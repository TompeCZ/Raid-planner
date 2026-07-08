ALTER TYPE "public"."attendance_status" ADD VALUE IF NOT EXISTS 'ABSENCE';--> statement-breakpoint
ALTER TABLE "attendance_record" DROP CONSTRAINT "attendance_record_assignment_id_unique";--> statement-breakpoint
ALTER TABLE "attendance_record" DROP CONSTRAINT "attendance_record_assignment_id_assignment_id_fk";
--> statement-breakpoint
ALTER TABLE "attendance_record" ADD COLUMN "raid_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_record" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_record" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_raid_id_raid_id_fk" FOREIGN KEY ("raid_id") REFERENCES "public"."raid"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_record_raid_id_idx" ON "attendance_record" USING btree ("raid_id");--> statement-breakpoint
ALTER TABLE "attendance_record" DROP COLUMN "assignment_id";--> statement-breakpoint
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_raid_user_uq" UNIQUE("raid_id","user_id");