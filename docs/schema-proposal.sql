-- =============================================================================
-- Raid & Absence Planner — SQL DDL NÁVRH (v1)
-- =============================================================================
-- Stav: NÁVRH KE SCHVÁLENÍ (spec.md bod 9.1 — jen schema + ER diagram, žádné
-- featury/UI). Toto je zdroj pravdy pro budoucí Drizzle migraci 0000_init.
-- Postgres / Supabase. Časy = timestamptz v UTC. Soft delete = deleted_at.
--
-- Zapracována 4 rozhodnutí (viz sekce ROZHODNUTÍ na konci):
--   1) denormalizace času na Assignment + 2 triggery (race-safe inv. 1)
--   2) inv. 4 ALL = aplikačně při submitu (jen YES/LATE/TENTATIVE); SINGLE v triggeru
--   3) blokace na absenci dle DATE(starts_at)
--   4) User = soft delete, všechny FK na User -> ON DELETE RESTRICT
-- =============================================================================

-- --- Rozšíření -----------------------------------------------------------------
-- gen_random_uuid() je v pgcrypto; btree_gist kvůli rovnosti character_id v GIST
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
-- User  (ROZHODNUTÍ 4: soft delete, NIKDY hard delete)
-- =============================================================================
CREATE TABLE "user" (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_id    text NOT NULL UNIQUE,   -- návrat hráče = match na discord_id (viz pozn.)
    display_name  text NOT NULL,
    role          user_role NOT NULL DEFAULT 'MEMBER',
    created_at    timestamptz NOT NULL DEFAULT now(),
    deleted_at    timestamptz             -- soft delete; historie zůstává joinovatelná
);

-- =============================================================================
-- Character  (UNIQUE(id, user_id) kvůli composite FK z Assignment)
-- =============================================================================
CREATE TABLE character (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
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
    -- role_quota: JSONB pevného tvaru; tvar hlídá CHECK (klíče = enum role, hodnoty int>=0)
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
-- idempotence generování instancí ze šablony
CREATE UNIQUE INDEX raid_template_starts_uq
    ON raid(template_id, starts_at)
    WHERE template_id IS NOT NULL;

-- =============================================================================
-- Signup  (jeden signup na hráče a raid)
-- =============================================================================
CREATE TABLE signup (
    id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    raid_id  uuid NOT NULL REFERENCES raid(id) ON DELETE CASCADE,
    user_id  uuid NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
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
    character_id  uuid NOT NULL REFERENCES character(id) ON DELETE RESTRICT,
    loot_note     text,
    CONSTRAINT signup_character_uq UNIQUE (signup_id, character_id)
);

-- =============================================================================
-- Assignment  (reálný setup; drží zámky invariantu 1)
--   - composite FK (character_id, user_id) -> character(id, user_id)
--   - starts_at/ends_at = DENORMALIZACE z raid kvůli exclusion constraintu;
--     plní VÝHRADNĚ trigger (ROZHODNUTÍ 1), aplikace je nikdy nenastavuje
-- =============================================================================
CREATE TABLE assignment (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    raid_id       uuid NOT NULL REFERENCES raid(id) ON DELETE CASCADE,
    character_id  uuid NOT NULL,
    user_id       uuid NOT NULL,
    role_in_raid  char_role NOT NULL,
    group_no      smallint CHECK (group_no BETWEEN 1 AND 5),
    status        assignment_status NOT NULL DEFAULT 'CONFIRMED',
    -- denormalizovaný čas raidu (plněno triggerem assignment_fill_raid_time)
    starts_at     timestamptz NOT NULL,
    ends_at       timestamptz NOT NULL,
    CONSTRAINT assignment_character_user_fk
        FOREIGN KEY (character_id, user_id)
        REFERENCES character(id, user_id) ON DELETE RESTRICT,
    CONSTRAINT assignment_raid_character_uq UNIQUE (raid_id, character_id),
    -- INVARIANT 1: jedna postava max v jednom CONFIRMED překrývajícím se raidu
    CONSTRAINT assignment_no_overlap
        EXCLUDE USING gist (
            character_id WITH =,
            tstzrange(starts_at, ends_at) WITH &&
        ) WHERE (status = 'CONFIRMED')
);
CREATE INDEX assignment_raid_id_idx ON assignment(raid_id);
CREATE INDEX assignment_user_id_idx ON assignment(user_id);

-- =============================================================================
-- Absence  (DATE rozsah, to_date inkluzivní, rušitelná)
-- =============================================================================
CREATE TABLE absence (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
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
    recorded_by    uuid NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
    recorded_at    timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Note  (vedení, LEADERSHIP)
-- =============================================================================
CREATE TABLE note (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id    uuid NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
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
    actor_id     uuid NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
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

-- --- ROZHODNUTÍ 1: denormalizace času raidu na Assignment --------------------
-- Plní starts_at/ends_at VÝHRADNĚ z navázaného raidu při KAŽDÉM INSERT/UPDATE,
-- takže aplikace tato pole nikdy nenastaví (jakákoli dodaná hodnota se přepíše).
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER assignment_fill_raid_time_trg
    BEFORE INSERT OR UPDATE ON assignment
    FOR EACH ROW EXECUTE FUNCTION assignment_fill_raid_time();

-- Propagace změny času raidu do VŠECH child Assignmentů toho raidu.
-- (fill trigger výše pak u každého řádku dopočítá totéž z raidu — konzistentní;
--  exclusion constraint se zároveň přepočítá → reschedule do překryvu selže.)
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER raid_propagate_time_trg
    AFTER UPDATE OF starts_at, ends_at ON raid
    FOR EACH ROW EXECUTE FUNCTION raid_propagate_time();

-- --- INVARIANT 2 (ROZHODNUTÍ 3): blokace Assignmentu při Absenci majitele ----
-- Rozhoduje DATE(starts_at) raidu; ends_at do pravidla nevstupuje.
-- Soft-deleted absence (deleted_at NOT NULL) NEBLOKUJE.
-- Scope na INSERT / UPDATE OF raid_id,user_id — pouhá propagace času (UPDATE
-- starts_at/ends_at) tento trigger nespouští, takže reschedule raidu neselže
-- kvůli absenci u existujících přiřazení.
--
-- POZOR — tento trigger hlídá JEN FORWARD směr: nelze přiřadit hráče, který už
-- má kolidující absenci. REVERSE směr (absence vytvořená/rozšířená až PO
-- existujícím CONFIRMED assignmentu — withdraw / "needs replacement" flow)
-- NENÍ a NEMÁ být v DB tvrdě blokován (jinak by nešlo zadat absenci po sestavení
-- setupu). Řeší se APLIKAČNĚ: po INSERT/rozšíření absence dohledat kolidující
-- CONFIRMED assignmenty a vyflagovat je RL. Invariant 2 tedy NENÍ plně uzavřený
-- triggerem. Případná DB pomoc = lehký trigger na absence, který kolidující
-- assignmenty jen OZNAČÍ (nikdy neraisne); do v1 stačí app-level.
CREATE OR REPLACE FUNCTION assignment_block_on_absence() RETURNS trigger AS $$
DECLARE
    v_raid_date date;
BEGIN
    -- UTC datum startu; pokud bude potřeba guild-local datum, zaměnit 'UTC' za tz guildy
    SELECT (r.starts_at AT TIME ZONE 'UTC')::date INTO v_raid_date
      FROM raid r WHERE r.id = NEW.raid_id;

    IF EXISTS (
        SELECT 1 FROM absence a
         WHERE a.user_id = NEW.user_id
           AND a.deleted_at IS NULL                       -- soft-deleted neblokuje
           AND v_raid_date BETWEEN a.from_date AND a.to_date  -- to_date inkluzivní
    ) THEN
        RAISE EXCEPTION
            'Hráč % má absenci pokrývající termín raidu (%).', NEW.user_id, v_raid_date;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assignment_block_on_absence_trg
    BEFORE INSERT OR UPDATE OF raid_id, user_id ON assignment
    FOR EACH ROW EXECUTE FUNCTION assignment_block_on_absence();

-- --- INVARIANT 3 + 4(SINGLE): validace signup poolu -------------------------
-- Hlídá: vlastnictví postavy, is_raid_ready, NEsmazanost postavy (deleted_at),
-- a v SINGLE módu právě jednu postavu. ALL "≥1" se NEřeší zde (ROZHODNUTÍ 2 —
-- aplikačně při submitu signupu pro YES/LATE/TENTATIVE).
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

    -- soft-deleted postava nesmí projít validací (nelze nabídnout)
    IF v_char_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Postava % je smazaná (soft delete).', NEW.character_id;
    END IF;

    -- vlastnictví: nabízená postava musí patřit hráči ze signupu
    IF v_char_user IS DISTINCT FROM v_signup_user THEN
        RAISE EXCEPTION 'Postava % nepatří hráči ze signupu.', NEW.character_id;
    END IF;

    -- INVARIANT 3: jen raid-ready postavy
    IF NOT v_ready THEN
        RAISE EXCEPTION 'Postava % není isRaidReady.', NEW.character_id;
    END IF;

    -- INVARIANT 4 (SINGLE): právě jedna postava na signup
    -- (aktuální řádek z počtu vylučujeme, aby UPDATE jediné postavy — např.
    --  loot_note — neselhal kvůli započtení sebe sama)
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER signup_character_validate_trg
    BEFORE INSERT OR UPDATE ON signup_character
    FOR EACH ROW EXECUTE FUNCTION signup_character_validate();

-- =============================================================================
-- ROZHODNUTÍ (zapracováno) — kontext pro pozdější Drizzle migraci
-- =============================================================================
-- 1. Denormalizace času + 2 triggery PONECHÁNY (race-safe inv. 1, žádný TOCTOU).
--    assignment.starts_at/ends_at plní výhradně assignment_fill_raid_time;
--    raid_propagate_time přepíše čas u všech child Assignmentů při změně raidu.
--
-- 2. Inv. 4 ALL ("≥1 postava") = APLIKAČNĚ při submitu signupu, jen pro
--    YES/LATE/TENTATIVE; ABSENT smí mít 0 postav. DB DEFERRABLE constraint
--    trigger se ve v1 NEDĚLÁ. (SINGLE = právě 1 je v triggeru výše.)
--
-- 3. Blokace na absenci dle DATE(starts_at); ends_at nevstupuje (i přes půlnoc
--    rozhoduje datum startu).
--
-- 4. User = SOFT DELETE (deleted_at), NIKDY hard delete. Všechny FK na User
--    -> ON DELETE RESTRICT (character, signup, absence, attendance_record.recorded_by,
--    note.author_id, audit_log.actor_id; composite FK assignment->character také
--    RESTRICT). Soft-deleted user: nepřihlásí se, jeho Characters se soft-deletnou,
--    vypadne z nových signupů; historické řádky zůstávají joinovatelné.
--    POZN. (neimplementovat teď): návrat hráče = match na discord_id + vyčištění
--    deleted_at, ať nevznikne duplicitní User.
