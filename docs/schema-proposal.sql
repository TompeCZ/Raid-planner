-- =============================================================================
-- Raid & Absence Planner — SQL DDL NÁVRH (v1)
-- =============================================================================
-- Stav: NÁVRH KE SCHVÁLENÍ (spec.md bod 9.1 — jen schema + ER diagram, žádné
-- featury/UI). Toto je zdroj pravdy pro budoucí Drizzle migraci 0000_init.
-- Postgres / Supabase. Časy = timestamptz v UTC. Soft delete = deletedAt.
-- =============================================================================

-- --- Rozšíření -----------------------------------------------------------------
-- gen_random_uuid() je v pgcrypto; btree_gist kvůli rovnosti characterId v GIST
-- indexu exclusion constraintu (invariant 1).
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- --- Enumy ---------------------------------------------------------------------
CREATE TYPE user_role          AS ENUM ('ADMIN', 'RAID_LEADER', 'MEMBER');
CREATE TYPE faction            AS ENUM ('ALLIANCE', 'HORDE');
CREATE TYPE char_role          AS ENUM ('TANK', 'HEALER', 'MELEE', 'RANGED');
CREATE TYPE signup_mode        AS ENUM ('ALL', 'SINGLE');
CREATE TYPE raid_status        AS ENUM ('DRAFT', 'OPEN', 'LOCKED', 'DONE', 'CANCELLED');
CREATE TYPE signup_status      AS ENUM ('YES', 'LATE', 'TENTATIVE', 'ABSENT');
CREATE TYPE assignment_status  AS ENUM ('CONFIRMED', 'BENCH');
CREATE TYPE attendance_status  AS ENUM ('PRESENT', 'LATE_EXCUSED', 'LATE_NO_EXCUSE', 'NO_SHOW', 'LEFT_EARLY');
CREATE TYPE attendance_source  AS ENUM ('MANUAL', 'WCL_IMPORT');
CREATE TYPE note_visibility    AS ENUM ('LEADERSHIP');
CREATE TYPE note_target_type   AS ENUM ('RAID', 'USER', 'GENERAL');

-- =============================================================================
-- User
-- =============================================================================
CREATE TABLE "user" (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_id    text NOT NULL UNIQUE,
    display_name  text NOT NULL,
    role          user_role NOT NULL DEFAULT 'MEMBER',
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Character  (UNIQUE(id, user_id) kvůli composite FK z Assignment)
-- =============================================================================
CREATE TABLE character (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    name          text NOT NULL,
    realm         text NOT NULL,
    faction       faction NOT NULL,
    class         text NOT NULL,
    role          char_role NOT NULL,
    is_raid_ready boolean NOT NULL DEFAULT false,
    external_url  text,
    note          text,
    deleted_at    timestamptz,
    CONSTRAINT character_id_user_id_key UNIQUE (id, user_id)
);
CREATE INDEX character_user_id_idx ON character(user_id);

-- =============================================================================
-- RaidTemplate
-- =============================================================================
CREATE TABLE raid_template (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instance            text NOT NULL,
    day_of_week         smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    default_start_time  time NOT NULL,
    duration_minutes    integer NOT NULL CHECK (duration_minutes > 0),
    signup_mode         signup_mode NOT NULL DEFAULT 'SINGLE',
    -- roleQuota: JSONB pevného tvaru; tvar hlídá CHECK (klíče = enum role, hodnoty int>=0)
    role_quota          jsonb
        CHECK (
            role_quota IS NULL OR (
                jsonb_typeof(role_quota) = 'object'
                AND role_quota ?& array['TANK','HEALER','MELEE','RANGED']
                AND (role_quota->>'TANK')::int   >= 0
                AND (role_quota->>'HEALER')::int >= 0
                AND (role_quota->>'MELEE')::int  >= 0
                AND (role_quota->>'RANGED')::int >= 0
            )
        ),
    default_capacity    integer NOT NULL CHECK (default_capacity > 0),
    discord_webhook_url text NOT NULL
);

-- =============================================================================
-- Raid  (partial UNIQUE(template_id, starts_at) = idempotence generování)
-- =============================================================================
CREATE TABLE raid (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id               uuid REFERENCES raid_template(id) ON DELETE SET NULL,
    instance                  text NOT NULL,
    starts_at                 timestamptz NOT NULL,
    ends_at                   timestamptz NOT NULL,
    signup_mode               signup_mode NOT NULL DEFAULT 'SINGLE',
    status                    raid_status NOT NULL DEFAULT 'DRAFT',
    capacity                  integer NOT NULL CHECK (capacity > 0),
    notes                     text,
    wcl_report_code           text,
    discord_webhook_override  text,
    CONSTRAINT raid_time_order CHECK (ends_at > starts_at)
);
CREATE UNIQUE INDEX raid_template_starts_uq
    ON raid(template_id, starts_at)
    WHERE template_id IS NOT NULL;

-- =============================================================================
-- Signup  (jeden signup na hráče a raid)
-- =============================================================================
CREATE TABLE signup (
    id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    raid_id  uuid NOT NULL REFERENCES raid(id) ON DELETE CASCADE,
    user_id  uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    status   signup_status NOT NULL,
    note     text,
    CONSTRAINT signup_raid_user_uq UNIQUE (raid_id, user_id)
);

-- =============================================================================
-- SignupCharacter  (pool postav po ořezu)
-- =============================================================================
CREATE TABLE signup_character (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    signup_id     uuid NOT NULL REFERENCES signup(id) ON DELETE CASCADE,
    character_id  uuid NOT NULL REFERENCES character(id) ON DELETE CASCADE,
    loot_note     text,
    CONSTRAINT signup_character_uq UNIQUE (signup_id, character_id)
);

-- =============================================================================
-- Assignment  (reálný setup; drží zámky invariantu 1)
--   - composite FK (character_id, user_id) -> character(id, user_id)
--   - raid_starts_at/ends_at = denormalizace z raid kvůli exclusion constraintu
-- =============================================================================
CREATE TABLE assignment (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    raid_id         uuid NOT NULL REFERENCES raid(id) ON DELETE CASCADE,
    character_id    uuid NOT NULL,
    user_id         uuid NOT NULL,
    role_in_raid    char_role NOT NULL,
    group_no        smallint CHECK (group_no BETWEEN 1 AND 5),
    status          assignment_status NOT NULL DEFAULT 'CONFIRMED',
    -- denormalizovaný čas raidu (plněno triggerem, viz níže)
    raid_starts_at  timestamptz NOT NULL,
    raid_ends_at    timestamptz NOT NULL,
    CONSTRAINT assignment_character_user_fk
        FOREIGN KEY (character_id, user_id)
        REFERENCES character(id, user_id) ON DELETE CASCADE,
    CONSTRAINT assignment_raid_character_uq UNIQUE (raid_id, character_id),
    -- INVARIANT 1: jedna postava max v jednom CONFIRMED překrývajícím se raidu
    CONSTRAINT assignment_no_overlap
        EXCLUDE USING gist (
            character_id WITH =,
            tstzrange(raid_starts_at, raid_ends_at) WITH &&
        ) WHERE (status = 'CONFIRMED')
);
CREATE INDEX assignment_raid_id_idx ON assignment(raid_id);
CREATE INDEX assignment_user_id_idx ON assignment(user_id);

-- =============================================================================
-- Absence  (DATE rozsah, toDate inkluzivní, rušitelná)
-- =============================================================================
CREATE TABLE absence (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    from_date   date NOT NULL,
    to_date     date NOT NULL,
    note        text,
    deleted_at  timestamptz,
    CONSTRAINT absence_date_order CHECK (to_date >= from_date)
);
CREATE INDEX absence_user_id_idx ON absence(user_id);

-- =============================================================================
-- AttendanceRecord  (ground-truth docházky; 1:1 na assignment)
-- =============================================================================
CREATE TABLE attendance_record (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id  uuid NOT NULL UNIQUE REFERENCES assignment(id) ON DELETE CASCADE,
    status         attendance_status NOT NULL,
    source         attendance_source NOT NULL DEFAULT 'MANUAL',
    recorded_by    uuid NOT NULL REFERENCES "user"(id),
    recorded_at    timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Note  (vedení, LEADERSHIP)
-- =============================================================================
CREATE TABLE note (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id    uuid NOT NULL REFERENCES "user"(id),
    visibility   note_visibility NOT NULL DEFAULT 'LEADERSHIP',
    target_type  note_target_type NOT NULL,
    target_id    uuid,  -- bez FK (polymorfní), NULL pro GENERAL
    body         text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT note_target_id_required
        CHECK (target_type = 'GENERAL' OR target_id IS NOT NULL)
);
CREATE INDEX note_target_idx ON note(target_type, target_id);

-- =============================================================================
-- AuditLog  (veřejný, append-only)
-- =============================================================================
CREATE TABLE audit_log (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id     uuid NOT NULL REFERENCES "user"(id),
    action       text NOT NULL,
    target_type  text NOT NULL,
    target_id    uuid,  -- polymorfní, bez FK
    description  text NOT NULL,
    "timestamp"  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_target_idx ON audit_log(target_type, target_id);

-- =============================================================================
-- TRIGGERY
-- =============================================================================

-- --- Denormalizace času raidu na Assignment (předpoklad exclusion constraintu)
CREATE OR REPLACE FUNCTION assignment_fill_raid_time() RETURNS trigger AS $$
BEGIN
    SELECT r.starts_at, r.ends_at
      INTO NEW.raid_starts_at, NEW.raid_ends_at
      FROM raid r
     WHERE r.id = NEW.raid_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Assignment odkazuje neexistující raid %', NEW.raid_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assignment_fill_raid_time_trg
    BEFORE INSERT OR UPDATE OF raid_id ON assignment
    FOR EACH ROW EXECUTE FUNCTION assignment_fill_raid_time();

-- Propagace změny času raidu do navázaných assignmentů
CREATE OR REPLACE FUNCTION raid_propagate_time() RETURNS trigger AS $$
BEGIN
    IF NEW.starts_at IS DISTINCT FROM OLD.starts_at
       OR NEW.ends_at IS DISTINCT FROM OLD.ends_at THEN
        UPDATE assignment
           SET raid_starts_at = NEW.starts_at,
               raid_ends_at   = NEW.ends_at
         WHERE raid_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER raid_propagate_time_trg
    AFTER UPDATE OF starts_at, ends_at ON raid
    FOR EACH ROW EXECUTE FUNCTION raid_propagate_time();

-- --- INVARIANT 2: blokace Assignmentu při Absenci majitele -------------------
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
           AND v_raid_date BETWEEN a.from_date AND a.to_date  -- to_date inkluzivní
    ) THEN
        RAISE EXCEPTION
            'Hráč % má absenci pokrývající termín raidu (%).', NEW.user_id, v_raid_date;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assignment_block_on_absence_trg
    BEFORE INSERT OR UPDATE ON assignment
    FOR EACH ROW EXECUTE FUNCTION assignment_block_on_absence();

-- --- INVARIANT 3 + 4: signup pool jen isRaidReady + vlastnictví + SINGLE count
CREATE OR REPLACE FUNCTION signup_character_validate() RETURNS trigger AS $$
DECLARE
    v_signup_user  uuid;
    v_raid_id      uuid;
    v_mode         signup_mode;
    v_char_user    uuid;
    v_ready        boolean;
    v_count        integer;
BEGIN
    SELECT s.user_id, s.raid_id INTO v_signup_user, v_raid_id
      FROM signup s WHERE s.id = NEW.signup_id;
    SELECT r.signup_mode INTO v_mode FROM raid r WHERE r.id = v_raid_id;
    SELECT c.user_id, c.is_raid_ready INTO v_char_user, v_ready
      FROM character c WHERE c.id = NEW.character_id;

    -- vlastnictví: nabízená postava musí patřit hráči ze signupu
    IF v_char_user IS DISTINCT FROM v_signup_user THEN
        RAISE EXCEPTION 'Postava % nepatří hráči ze signupu.', NEW.character_id;
    END IF;

    -- INVARIANT 3: jen raid-ready postavy
    IF NOT v_ready THEN
        RAISE EXCEPTION 'Postava % není isRaidReady.', NEW.character_id;
    END IF;

    -- INVARIANT 4: SINGLE = právě jedna postava na signup
    IF v_mode = 'SINGLE' THEN
        SELECT count(*) INTO v_count
          FROM signup_character sc WHERE sc.signup_id = NEW.signup_id;
        IF v_count >= 1 THEN
            RAISE EXCEPTION 'SINGLE mód: signup smí nabídnout jen jednu postavu.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER signup_character_validate_trg
    BEFORE INSERT OR UPDATE ON signup_character
    FOR EACH ROW EXECUTE FUNCTION signup_character_validate();

-- =============================================================================
-- OTEVŘENÉ OTÁZKY K ROZHODNUTÍ (před převodem do Drizzle migrace)
-- =============================================================================
-- 1. Invariant 4 (ALL mód, ≥1 postava): "alespoň jedna" nejde vynutit při INSERTu
--    první postavy bez deferred constraintu. Návrh: hlídat aplikačně při uzavření
--    signupu, nebo přidat DEFERRABLE constraint trigger. Aktuálně neřešeno v DDL.
-- 2. Blokace absencí (inv. 2) bere jen datum startu raidu. Vícedenní raid (přes
--    půlnoc) by chtěl porovnávat celý rozsah — zatím dle specu jen startsAt.
-- 3. group_no rozsah 1–5 je pro 25man; 10man používá 1–2. Necháno 1–5 (širší).
-- 4. ON DELETE chování: User smaž → kaskáda na Character/Signup/Absence. Zvážit
--    zda nepreferovat výhradně soft delete (deletedAt) i pro User.
