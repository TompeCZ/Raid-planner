/**
 * Raid & Absence Planner — Drizzle schema (v1)
 *
 * Zdroj pravdy pro typy a pro většinu DDL. Postgres-native části, které Drizzle
 * neumí vyjádřit (exclusion constraint inv. 1, triggery inv. 2/3/4-SINGLE,
 * propagace času, btree_gist), se doplňují ručně v migraci `drizzle/0000_init.sql`.
 * Návrhový dokument: docs/schema-proposal.sql, docs/er-diagram.md.
 *
 * Konvence: časy = timestamptz v UTC; soft delete = deletedAt.
 */
import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  smallint,
  integer,
  time,
  date,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  unique,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/* Enumy                                                                      */
/* -------------------------------------------------------------------------- */
export const userRole = pgEnum("user_role", ["ADMIN", "RAID_LEADER", "MEMBER"]);
export const faction = pgEnum("faction", ["ALLIANCE", "HORDE"]);
export const charRole = pgEnum("char_role", ["TANK", "HEALER", "MELEE", "RANGED"]);
export const signupMode = pgEnum("signup_mode", ["ALL", "SINGLE"]);
export const raidStatus = pgEnum("raid_status", [
  "DRAFT",
  "OPEN",
  "LOCKED",
  "DONE",
  "CANCELLED",
]);
export const signupStatus = pgEnum("signup_status", [
  "YES",
  "LATE",
  "TENTATIVE",
  "ABSENT",
]);
export const assignmentStatus = pgEnum("assignment_status", ["CONFIRMED", "BENCH"]);
export const attendanceStatus = pgEnum("attendance_status", [
  "PRESENT",
  "LATE_EXCUSED",
  "LATE_NO_EXCUSE",
  "NO_SHOW",
  "LEFT_EARLY",
  "ABSENCE",
]);
export const attendanceSource = pgEnum("attendance_source", ["MANUAL", "WCL_IMPORT"]);
// Pořadí je významné — Postgres řadí enum podle pořadí deklarace, roster se řadí ORDER BY guild_rank.
export const guildRank = pgEnum("guild_rank", [
  "GUILDMASTER",
  "OFFICER",
  "VETERAN",
  "MEMBER",
  "INITIATE",
  "RECRUIT",
  "ALT",
]);
export const noteVisibility = pgEnum("note_visibility", ["LEADERSHIP", "PRIVATE"]);
export const noteCategory = pgEnum("note_category", [
  "PERFORMANCE",
  "BEHAVIOR",
  "ATTENDANCE",
  "LOOT",
  "RECRUITMENT",
  "OTHER",
]);
export const noteSentiment = pgEnum("note_sentiment", ["POSITIVE", "NEUTRAL", "CONCERN"]);

/* -------------------------------------------------------------------------- */
/* User  (soft delete, nikdy hard delete)                                     */
/* -------------------------------------------------------------------------- */
export const user = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  discordId: text("discord_id").notNull().unique(),
  displayName: text("display_name").notNull(),
  role: userRole("role").notNull().default("MEMBER"),
  // Nullable záměrně — "nenastaveno" musí být odlišitelné od "MEMBER". Plní se
  // zatím ručně RL; sync z Battle.net Profile API je pozdější krok (BACKLOG).
  guildRank: guildRank("guild_rank"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  // Token pro iCal odběr (/api/calendar/[token]). Nullable — vygeneruje se až
  // na vyžádání z dashboardu; "vygenerovat znovu" nastaví nový uuid, čímž
  // zneplatní starou URL (viz src/app/calendar-feed-actions.ts).
  calendarToken: uuid("calendar_token").unique(),
});

/* -------------------------------------------------------------------------- */
/* Character  (UNIQUE(id, user_id) kvůli composite FK z Assignment)           */
/* -------------------------------------------------------------------------- */
export const character = pgTable(
  "character",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    realm: text("realm").notNull(),
    faction: faction("faction").notNull(),
    class: text("class").notNull(),
    role: charRole("role").notNull(),
    isRaidReady: boolean("is_raid_ready").notNull().default(false),
    // Hlavní postava hráče — max 1 na hráče, vynuceno parciálním unique
    // indexem `character_one_main_per_user` (WHERE is_main AND deleted_at IS
    // NULL), doplněným ručně do migrace (Drizzle partial unique přes bool +
    // NULL check nevyjádří).
    isMain: boolean("is_main").notNull().default(false),
    externalUrl: text("external_url"),
    note: text("note"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    unique("character_id_user_id_key").on(t.id, t.userId),
    index("character_user_id_idx").on(t.userId),
  ],
);

export type User = typeof user.$inferSelect;
export type Character = typeof character.$inferSelect;
export type NewCharacter = typeof character.$inferInsert;

/* -------------------------------------------------------------------------- */
/* RaidTemplate                                                               */
/* -------------------------------------------------------------------------- */
export const raidTemplate = pgTable(
  "raid_template",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    instance: text("instance").notNull(),
    dayOfWeek: smallint("day_of_week").notNull(),
    defaultStartTime: time("default_start_time").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    signupMode: signupMode("signup_mode").notNull().default("SINGLE"),
    // JSONB pevného tvaru: { TANK,HEALER,MELEE,RANGED: int>=0 }; tvar hlídá CHECK
    roleQuota: jsonb("role_quota"),
    defaultCapacity: integer("default_capacity").notNull(),
    discordWebhookUrl: text("discord_webhook_url").notNull(),
  },
  (t) => [
    check("raid_template_day_of_week_check", sql`${t.dayOfWeek} BETWEEN 0 AND 6`),
    check("raid_template_duration_check", sql`${t.durationMinutes} > 0`),
    check("raid_template_capacity_check", sql`${t.defaultCapacity} > 0`),
    check(
      "raid_template_role_quota_check",
      sql`${t.roleQuota} IS NULL OR (
        jsonb_typeof(${t.roleQuota}) = 'object'
        AND ${t.roleQuota} ?& array['TANK','HEALER','MELEE','RANGED']
        AND (${t.roleQuota}->>'TANK')::int   >= 0
        AND (${t.roleQuota}->>'HEALER')::int >= 0
        AND (${t.roleQuota}->>'MELEE')::int  >= 0
        AND (${t.roleQuota}->>'RANGED')::int >= 0
      )`,
    ),
  ],
);

export type RaidTemplate = typeof raidTemplate.$inferSelect;

/* -------------------------------------------------------------------------- */
/* Raid  (partial UNIQUE(template_id, starts_at) = idempotence generování)    */
/* -------------------------------------------------------------------------- */
export const raid = pgTable(
  "raid",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id").references(() => raidTemplate.id, {
      onDelete: "set null",
    }),
    instance: text("instance").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    signupMode: signupMode("signup_mode").notNull().default("SINGLE"),
    status: raidStatus("status").notNull().default("DRAFT"),
    capacity: integer("capacity").notNull(),
    notes: text("notes"),
    wclReportCode: text("wcl_report_code"),
    discordWebhookOverride: text("discord_webhook_override"),
    // Discord publikace (setup + oznámení raidu) — viz raids/[raidId]/actions.ts
    // a raids/[raidId]/setup/actions.ts. Message id umožňuje re-publikaci přes
    // edit místo nové zprávy; snapshot je vstup pro diff změnových zpráv (ČÁST C).
    discordAnnouncementMessageId: text("discord_announcement_message_id"),
    discordSetupMessageId: text("discord_setup_message_id"),
    discordSetupSnapshot: jsonb("discord_setup_snapshot"),
  },
  (t) => [
    check("raid_time_order", sql`${t.endsAt} > ${t.startsAt}`),
    check("raid_capacity_check", sql`${t.capacity} > 0`),
    // idempotence generování instancí ze šablony
    uniqueIndex("raid_template_starts_uq")
      .on(t.templateId, t.startsAt)
      .where(sql`${t.templateId} IS NOT NULL`),
  ],
);

export type Raid = typeof raid.$inferSelect;
export type NewRaid = typeof raid.$inferInsert;

/* -------------------------------------------------------------------------- */
/* Signup  (jeden signup na hráče a raid)                                     */
/* -------------------------------------------------------------------------- */
export const signup = pgTable(
  "signup",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    raidId: uuid("raid_id")
      .notNull()
      .references(() => raid.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    status: signupStatus("status").notNull(),
    note: text("note"),
  },
  (t) => [unique("signup_raid_user_uq").on(t.raidId, t.userId)],
);

export type Signup = typeof signup.$inferSelect;

/* -------------------------------------------------------------------------- */
/* SignupCharacter  (pool postav po ořezu)                                    */
/* -------------------------------------------------------------------------- */
export const signupCharacter = pgTable(
  "signup_character",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    signupId: uuid("signup_id")
      .notNull()
      .references(() => signup.id, { onDelete: "cascade" }),
    characterId: uuid("character_id")
      .notNull()
      .references(() => character.id, { onDelete: "restrict" }),
    lootNote: text("loot_note"),
  },
  (t) => [unique("signup_character_uq").on(t.signupId, t.characterId)],
);

/* -------------------------------------------------------------------------- */
/* Assignment  (reálný setup; drží zámky invariantu 1)                        */
/*   - composite FK (character_id, user_id) -> character(id, user_id)         */
/*   - starts_at/ends_at = denormalizace z raid; plní VÝHRADNĚ trigger        */
/*   - exclusion constraint (inv. 1) se přidává v migraci ručně               */
/* -------------------------------------------------------------------------- */
export const assignment = pgTable(
  "assignment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    raidId: uuid("raid_id")
      .notNull()
      .references(() => raid.id, { onDelete: "cascade" }),
    characterId: uuid("character_id").notNull(),
    userId: uuid("user_id").notNull(),
    roleInRaid: charRole("role_in_raid").notNull(),
    groupNo: smallint("group_no"),
    // Explicitní pozice 1-5 uvnitř skupiny (jinak by pořadí v mřížce bylo jen
    // pořadí insertu). Uniqueness (raid_id, group_no, slot_no) se nevynucuje v
    // DB — o kolize se stará appka (assignToGroup/swapAssignments).
    slotNo: smallint("slot_no"),
    status: assignmentStatus("status").notNull().default("CONFIRMED"),
    // denormalizovaný čas raidu (plněno triggerem assignment_fill_raid_time)
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    foreignKey({
      name: "assignment_character_user_fk",
      columns: [t.characterId, t.userId],
      foreignColumns: [character.id, character.userId],
    }).onDelete("restrict"),
    unique("assignment_raid_character_uq").on(t.raidId, t.characterId),
    // 40man: 8 skupin x 5 slotů (kapacita 5/skupinu se hlídá aplikačně, ne CHECKem).
    check("assignment_group_no_check", sql`${t.groupNo} BETWEEN 1 AND 8`),
    check("assignment_slot_no_check", sql`${t.slotNo} BETWEEN 1 AND 5`),
    index("assignment_raid_id_idx").on(t.raidId),
    index("assignment_user_id_idx").on(t.userId),
    // POZN.: EXCLUDE USING gist (character_id WITH =, tstzrange(starts_at,ends_at)
    // WITH &&) WHERE status='CONFIRMED' — doplněno ručně v drizzle/0000_init.sql
  ],
);

export type Assignment = typeof assignment.$inferSelect;
export type NewAssignment = typeof assignment.$inferInsert;

/* -------------------------------------------------------------------------- */
/* Absence  (DATE rozsah, to_date inkluzivní, rušitelná)                      */
/* -------------------------------------------------------------------------- */
export const absence = pgTable(
  "absence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    fromDate: date("from_date").notNull(),
    toDate: date("to_date").notNull(),
    note: text("note"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    check("absence_date_order", sql`${t.toDate} >= ${t.fromDate}`),
    index("absence_user_id_idx").on(t.userId),
  ],
);

export type Absence = typeof absence.$inferSelect;
export type NewAbsence = typeof absence.$inferInsert;

/* -------------------------------------------------------------------------- */
/* AttendanceRecord  (ground-truth docházky; per (raid_id, user_id), ne per   */
/* assignment — role CONFIRMED/BENCH se bere ze assignment při čtení)        */
/* -------------------------------------------------------------------------- */
export const attendanceRecord = pgTable(
  "attendance_record",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    raidId: uuid("raid_id")
      .notNull()
      .references(() => raid.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: attendanceStatus("status").notNull(),
    // Důvod u ABSENCE (seedováno z absence.note) nebo ruční poznámka RL.
    note: text("note"),
    source: attendanceSource("source").notNull().default("MANUAL"),
    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("attendance_record_raid_user_uq").on(t.raidId, t.userId),
    index("attendance_record_raid_id_idx").on(t.raidId),
  ],
);

export type AttendanceRecord = typeof attendanceRecord.$inferSelect;
export type NewAttendanceRecord = typeof attendanceRecord.$inferInsert;

/* -------------------------------------------------------------------------- */
/* Note  (neveřejné poznámky vedení; subject-anchored, ne polymorfní)         */
/*   - kotva je vždy subjectUserId; characterId/raidId jsou volitelný kontext */
/*   - jen subjectUserId          -> stálá poznámka k hráči                  */
/*   - + raidId                   -> chování hráče v daném raidu             */
/*   - + raidId + characterId     -> výkon konkrétní postavy v daném raidu   */
/* -------------------------------------------------------------------------- */
export const note = pgTable(
  "note",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    subjectUserId: uuid("subject_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    characterId: uuid("character_id"), // nullable; composite FK níže
    raidId: uuid("raid_id").references(() => raid.id, { onDelete: "restrict" }), // nullable
    category: noteCategory("category").notNull().default("OTHER"),
    sentiment: noteSentiment("sentiment").notNull().default("NEUTRAL"),
    visibility: noteVisibility("visibility").notNull().default("LEADERSHIP"),
    pinned: boolean("pinned").notNull().default(false),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Postava MUSÍ patřit subjektu poznámky — vynuceno na DB úrovni stejným
    // composite FK trikem jako `assignment_character_user_fk` (opřeno o unique
    // `character_id_user_id_key`). MATCH SIMPLE (Postgres default, žádná MATCH
    // klauzule) — díky tomu se při character_id IS NULL FK vůbec nekontroluje
    // (poznámka bez postavy), ale jakmile je vyplněné, vazba se vynutí. Nikdy
    // MATCH FULL, ten by poznámky bez postavy rozbil.
    foreignKey({
      name: "note_character_subject_fk",
      columns: [t.characterId, t.subjectUserId],
      foreignColumns: [character.id, character.userId],
    }),
    check("note_body_not_blank", sql`length(btrim(${t.body})) > 0`),
    index("note_subject_idx").on(t.subjectUserId, t.createdAt),
    index("note_raid_idx").on(t.raidId),
    index("note_author_idx").on(t.authorId),
  ],
);

export type Note = typeof note.$inferSelect;
export type NewNote = typeof note.$inferInsert;

/* -------------------------------------------------------------------------- */
/* NoteRevision  (historie editací poznámek; leadership-only)                */
/* -------------------------------------------------------------------------- */
export const noteRevision = pgTable(
  "note_revision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => note.id, { onDelete: "cascade" }),
    editedBy: uuid("edited_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    editedAt: timestamp("edited_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    previousBody: text("previous_body").notNull(), // snapshot těla PŘED editací
  },
  (t) => [index("note_revision_note_idx").on(t.noteId, t.editedAt)],
);

export type NoteRevision = typeof noteRevision.$inferSelect;

/* -------------------------------------------------------------------------- */
/* AuditLog  (veřejný, append-only)                                           */
/* -------------------------------------------------------------------------- */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id"), // polymorfní, bez FK
    description: text("description").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("audit_log_target_idx").on(t.targetType, t.targetId)],
);

export type NewAuditLog = typeof auditLog.$inferInsert;
