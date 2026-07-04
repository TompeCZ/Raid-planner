ALTER TABLE "assignment" ADD COLUMN "slot_no" smallint;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_slot_no_check" CHECK ("assignment"."slot_no" BETWEEN 1 AND 5);