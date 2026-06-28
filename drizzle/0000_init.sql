-- Postgres rozšíření: pgcrypto = gen_random_uuid(), btree_gist = rovnost v GIST
-- indexu pro exclusion constraint (invariant 1). Musí být před jejich použitím.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "btree_gist";--> statement-breakpoint
CREATE TYPE "public"."assignment_status" AS ENUM('CONFIRMED', 'BENCH');--> statement-breakpoint
CREATE TYPE "public"."attendance_source" AS ENUM('MANUAL', 'WCL_IMPORT');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('PRESENT', 'LATE_EXCUSED', 'LATE_NO_EXCUSE', 'NO_SHOW', 'LEFT_EARLY');--> statement-breakpoint
CREATE TYPE "public"."char_role" AS ENUM('TANK', 'HEALER', 'MELEE', 'RANGED');--> statement-breakpoint
CREATE TYPE "public"."faction" AS ENUM('ALLIANCE', 'HORDE');--> statement-breakpoint
CREATE TYPE "public"."note_target_type" AS ENUM('RAID', 'USER', 'GENERAL');--> statement-breakpoint
CREATE TYPE "public"."note_visibility" AS ENUM('LEADERSHIP');--> statement-breakpoint
CREATE TYPE "public"."raid_status" AS ENUM('DRAFT', 'OPEN', 'LOCKED', 'DONE', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."signup_mode" AS ENUM('ALL', 'SINGLE');--> statement-breakpoint
CREATE TYPE "public"."signup_status" AS ENUM('YES', 'LATE', 'TENTATIVE', 'ABSENT');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'RAID_LEADER', 'MEMBER');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "absence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"note" text,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "absence_date_order" CHECK ("absence"."to_date" >= "absence"."from_date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raid_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role_in_raid" char_role NOT NULL,
	"group_no" smallint,
	"status" "assignment_status" DEFAULT 'CONFIRMED' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	CONSTRAINT "assignment_raid_character_uq" UNIQUE("raid_id","character_id"),
	CONSTRAINT "assignment_group_no_check" CHECK ("assignment"."group_no" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attendance_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"status" "attendance_status" NOT NULL,
	"source" "attendance_source" DEFAULT 'MANUAL' NOT NULL,
	"recorded_by" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_record_assignment_id_unique" UNIQUE("assignment_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"description" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "character" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"realm" text NOT NULL,
	"faction" "faction" NOT NULL,
	"class" text NOT NULL,
	"role" char_role NOT NULL,
	"is_raid_ready" boolean DEFAULT false NOT NULL,
	"external_url" text,
	"note" text,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "character_id_user_id_key" UNIQUE("id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"visibility" "note_visibility" DEFAULT 'LEADERSHIP' NOT NULL,
	"target_type" "note_target_type" NOT NULL,
	"target_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_target_id_required" CHECK ("note"."target_type" = 'GENERAL' OR "note"."target_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "raid" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid,
	"instance" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"signup_mode" "signup_mode" DEFAULT 'SINGLE' NOT NULL,
	"status" "raid_status" DEFAULT 'DRAFT' NOT NULL,
	"capacity" integer NOT NULL,
	"notes" text,
	"wcl_report_code" text,
	"discord_webhook_override" text,
	CONSTRAINT "raid_time_order" CHECK ("raid"."ends_at" > "raid"."starts_at"),
	CONSTRAINT "raid_capacity_check" CHECK ("raid"."capacity" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "raid_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance" text NOT NULL,
	"day_of_week" smallint NOT NULL,
	"default_start_time" time NOT NULL,
	"duration_minutes" integer NOT NULL,
	"signup_mode" "signup_mode" DEFAULT 'SINGLE' NOT NULL,
	"role_quota" jsonb,
	"default_capacity" integer NOT NULL,
	"discord_webhook_url" text NOT NULL,
	CONSTRAINT "raid_template_day_of_week_check" CHECK ("raid_template"."day_of_week" BETWEEN 0 AND 6),
	CONSTRAINT "raid_template_duration_check" CHECK ("raid_template"."duration_minutes" > 0),
	CONSTRAINT "raid_template_capacity_check" CHECK ("raid_template"."default_capacity" > 0),
	CONSTRAINT "raid_template_role_quota_check" CHECK ("raid_template"."role_quota" IS NULL OR (
        jsonb_typeof("raid_template"."role_quota") = 'object'
        AND "raid_template"."role_quota" ?& array['TANK','HEALER','MELEE','RANGED']
        AND ("raid_template"."role_quota"->>'TANK')::int   >= 0
        AND ("raid_template"."role_quota"->>'HEALER')::int >= 0
        AND ("raid_template"."role_quota"->>'MELEE')::int  >= 0
        AND ("raid_template"."role_quota"->>'RANGED')::int >= 0
      ))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "signup" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raid_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "signup_status" NOT NULL,
	"note" text,
	CONSTRAINT "signup_raid_user_uq" UNIQUE("raid_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "signup_character" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signup_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"loot_note" text,
	CONSTRAINT "signup_character_uq" UNIQUE("signup_id","character_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discord_id" text NOT NULL,
	"display_name" text NOT NULL,
	"role" "user_role" DEFAULT 'MEMBER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "user_discord_id_unique" UNIQUE("discord_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "absence" ADD CONSTRAINT "absence_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignment" ADD CONSTRAINT "assignment_raid_id_raid_id_fk" FOREIGN KEY ("raid_id") REFERENCES "public"."raid"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignment" ADD CONSTRAINT "assignment_character_user_fk" FOREIGN KEY ("character_id","user_id") REFERENCES "public"."character"("id","user_id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_assignment_id_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignment"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "character" ADD CONSTRAINT "character_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "note" ADD CONSTRAINT "note_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "raid" ADD CONSTRAINT "raid_template_id_raid_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."raid_template"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "signup" ADD CONSTRAINT "signup_raid_id_raid_id_fk" FOREIGN KEY ("raid_id") REFERENCES "public"."raid"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "signup" ADD CONSTRAINT "signup_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "signup_character" ADD CONSTRAINT "signup_character_signup_id_signup_id_fk" FOREIGN KEY ("signup_id") REFERENCES "public"."signup"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "signup_character" ADD CONSTRAINT "signup_character_character_id_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."character"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "absence_user_id_idx" ON "absence" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignment_raid_id_idx" ON "assignment" USING btree ("raid_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignment_user_id_idx" ON "assignment" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_target_idx" ON "audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "character_user_id_idx" ON "character" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "note_target_idx" ON "note" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "raid_template_starts_uq" ON "raid" USING btree ("template_id","starts_at") WHERE "raid"."template_id" IS NOT NULL;--> statement-breakpoint

-- =============================================================================
-- Postgres-native části, které Drizzle schema neumí vyjádřit.
-- Drizzle je nesleduje ve snapshotu → necháváme je při dalších `generate` na pokoji.
-- Zdroj pravdy a komentáře: docs/schema-proposal.sql.
-- =============================================================================

-- --- INVARIANT 1: postava max v 1 CONFIRMED překrývajícím se raidu -----------
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_no_overlap"
    EXCLUDE USING gist (
        "character_id" WITH =,
        tstzrange("starts_at", "ends_at") WITH &&
    ) WHERE (status = 'CONFIRMED');--> statement-breakpoint

-- --- ROZHODNUTÍ 1: denormalizace času raidu na Assignment --------------------
-- Plní starts_at/ends_at VÝHRADNĚ z navázaného raidu při KAŽDÉM INSERT/UPDATE.
CREATE OR REPLACE FUNCTION assignment_fill_raid_time() RETURNS trigger AS $$
BEGIN
    SELECT r.starts_at, r.ends_at
      INTO NEW.starts_at, NEW.ends_at
      FROM raid r
     WHERE r.id = NEW.raid_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Assignment odkazuje neexistující raid %', NEW.raid_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER assignment_fill_raid_time_trg
    BEFORE INSERT OR UPDATE ON assignment
    FOR EACH ROW EXECUTE FUNCTION assignment_fill_raid_time();--> statement-breakpoint

-- Propagace změny času raidu do VŠECH child Assignmentů toho raidu.
CREATE OR REPLACE FUNCTION raid_propagate_time() RETURNS trigger AS $$
BEGIN
    IF NEW.starts_at IS DISTINCT FROM OLD.starts_at
       OR NEW.ends_at IS DISTINCT FROM OLD.ends_at THEN
        UPDATE assignment
           SET starts_at = NEW.starts_at,
               ends_at   = NEW.ends_at
         WHERE raid_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER raid_propagate_time_trg
    AFTER UPDATE OF starts_at, ends_at ON raid
    FOR EACH ROW EXECUTE FUNCTION raid_propagate_time();--> statement-breakpoint

-- --- INVARIANT 2 (forward-only): blokace Assignmentu při Absenci majitele ----
-- Hlídá jen forward směr (nelze přiřadit už-absentního hráče). Reverse směr
-- (absence po existujícím assignmentu) se řeší APLIKAČNĚ. Soft-deleted absence
-- neblokuje. Rozhoduje DATE(starts_at) v UTC.
CREATE OR REPLACE FUNCTION assignment_block_on_absence() RETURNS trigger AS $$
DECLARE
    v_raid_date date;
BEGIN
    SELECT (r.starts_at AT TIME ZONE 'UTC')::date INTO v_raid_date
      FROM raid r WHERE r.id = NEW.raid_id;

    IF EXISTS (
        SELECT 1 FROM absence a
         WHERE a.user_id = NEW.user_id
           AND a.deleted_at IS NULL
           AND v_raid_date BETWEEN a.from_date AND a.to_date
    ) THEN
        RAISE EXCEPTION
            'Hráč % má absenci pokrývající termín raidu (%).', NEW.user_id, v_raid_date;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER assignment_block_on_absence_trg
    BEFORE INSERT OR UPDATE OF raid_id, user_id ON assignment
    FOR EACH ROW EXECUTE FUNCTION assignment_block_on_absence();--> statement-breakpoint

-- --- INVARIANT 3 + 4(SINGLE): validace signup poolu -------------------------
-- Vlastnictví postavy, is_raid_ready, ne-smazanost (deleted_at), a v SINGLE módu
-- právě jedna postava (aktuální řádek z countu vyloučen kvůli UPDATE loot_note).
CREATE OR REPLACE FUNCTION signup_character_validate() RETURNS trigger AS $$
DECLARE
    v_signup_user  uuid;
    v_raid_id      uuid;
    v_mode         signup_mode;
    v_char_user    uuid;
    v_ready        boolean;
    v_char_deleted timestamptz;
    v_count        integer;
BEGIN
    SELECT s.user_id, s.raid_id INTO v_signup_user, v_raid_id
      FROM signup s WHERE s.id = NEW.signup_id;
    SELECT r.signup_mode INTO v_mode FROM raid r WHERE r.id = v_raid_id;
    SELECT c.user_id, c.is_raid_ready, c.deleted_at
      INTO v_char_user, v_ready, v_char_deleted
      FROM character c WHERE c.id = NEW.character_id;

    IF v_char_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Postava % je smazaná (soft delete).', NEW.character_id;
    END IF;

    IF v_char_user IS DISTINCT FROM v_signup_user THEN
        RAISE EXCEPTION 'Postava % nepatří hráči ze signupu.', NEW.character_id;
    END IF;

    IF NOT v_ready THEN
        RAISE EXCEPTION 'Postava % není isRaidReady.', NEW.character_id;
    END IF;

    IF v_mode = 'SINGLE' THEN
        SELECT count(*) INTO v_count
          FROM signup_character sc
         WHERE sc.signup_id = NEW.signup_id
           AND sc.id <> NEW.id;
        IF v_count >= 1 THEN
            RAISE EXCEPTION 'SINGLE mód: signup smí nabídnout jen jednu postavu.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER signup_character_validate_trg
    BEFORE INSERT OR UPDATE ON signup_character
    FOR EACH ROW EXECUTE FUNCTION signup_character_validate();