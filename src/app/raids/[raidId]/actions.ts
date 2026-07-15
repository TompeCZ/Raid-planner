"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  raid,
  signup,
  signupCharacter,
  character,
  signupStatus,
  user,
  assignment,
  absence,
  attendanceRecord,
  attendanceStatus,
  auditLog,
} from "@/db/schema";
import { canManageRaids, getCurrentAppUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { resolveDisplayName } from "@/lib/display-name";
import { editDiscordMessage, postDiscordMessage, type DiscordMessagePayload } from "@/lib/discord-webhook";
import { formatRaidDateTimeLabel, toPragueDateKey } from "@/lib/local-date";
import { getMainCharacterNamesByUserId } from "@/lib/main-character";
import { buildAnnouncementContent } from "./discord-announcement";
import { deriveSeededAttendance, type SeedAbsenceRange } from "./attendance-seed";
import { readRaidForm } from "../raid-validation";
import { canTransitionRaidStatus, isRaidEditable } from "../raid-status";

type RaidStatus = (typeof raid.status.enumValues)[number];
export type AttendanceStatus = (typeof attendanceStatus.enumValues)[number];

const SIGNUP_STATUSES = signupStatus.enumValues;

async function requireAppUser() {
  const appUser = await getCurrentAppUser();
  if (!appUser) throw new Error("Nepřihlášeno.");
  return appUser;
}

async function requireRaidLeader() {
  const appUser = await requireAppUser();
  if (!canManageRaids(appUser)) throw new Error("Akce vyžaduje roli RAID_LEADER nebo ADMIN.");
  return appUser;
}

async function requireRaid(raidId: string) {
  const [row] = await db.select().from(raid).where(eq(raid.id, raidId)).limit(1);
  if (!row) throw new Error("Raid nenalezen.");
  return row;
}

/** Data pro stránku raidu: raid, moje raid-ready postavy, můj signup, roster. */
export async function getRaidPageData(raidId: string) {
  const appUser = await requireAppUser();
  const raidRow = await requireRaid(raidId);

  const myCharacters = await db
    .select()
    .from(character)
    .where(
      and(
        eq(character.userId, appUser.id),
        eq(character.isRaidReady, true),
        isNull(character.deletedAt),
      ),
    )
    .orderBy(character.name);

  const [mySignup] = await db
    .select()
    .from(signup)
    .where(and(eq(signup.raidId, raidId), eq(signup.userId, appUser.id)))
    .limit(1);

  let mySignupCharacterIds: string[] = [];
  if (mySignup) {
    const rows = await db
      .select({ characterId: signupCharacter.characterId })
      .from(signupCharacter)
      .where(eq(signupCharacter.signupId, mySignup.id));
    mySignupCharacterIds = rows.map((r) => r.characterId);
  }

  const rosterRows = await db
    .select({
      signupId: signup.id,
      status: signup.status,
      userId: signup.userId,
      displayName: user.displayName,
      characterId: character.id,
      characterName: character.name,
    })
    .from(signup)
    .innerJoin(user, eq(user.id, signup.userId))
    .leftJoin(signupCharacter, eq(signupCharacter.signupId, signup.id))
    .leftJoin(character, eq(character.id, signupCharacter.characterId))
    .where(eq(signup.raidId, raidId))
    .orderBy(user.displayName);

  // Řádky jsou po JOINu 1:N (signup:postavy) — sloučit zpět na 1 řádek na signup.
  const rosterBySignupId = new Map<
    string,
    {
      signupId: string;
      status: (typeof SIGNUP_STATUSES)[number];
      userId: string;
      displayName: string;
      characterNames: string[];
      // Souběžně s characterNames — pro kontextové psaní poznámky z detailu
      // raidu (RL vidí jméno, actions.ts potřebuje id, viz raids/[raidId]/page.tsx).
      characterIds: string[];
    }
  >();
  for (const row of rosterRows) {
    const entry = rosterBySignupId.get(row.signupId) ?? {
      signupId: row.signupId,
      status: row.status,
      userId: row.userId,
      displayName: row.displayName,
      characterNames: [],
      characterIds: [],
    };
    if (row.characterName) entry.characterNames.push(row.characterName);
    if (row.characterId) entry.characterIds.push(row.characterId);
    rosterBySignupId.set(row.signupId, entry);
  }

  // Hráči, které RL přiřadil do setupu ručně mimo přihlášené (setup builderu
  // sekce „mimo přihlášené" — `otherCharacters`), tedy bez vlastního signupu.
  // Zobrazí se v „Přihlášení hráči" taky, ať je vidět celý roster na jednom
  // místě, ne jen v setup builderu.
  const signedUpUserIds = new Set(Array.from(rosterBySignupId.values()).map((r) => r.userId));
  const assignmentOnlyRows = await db
    .select({
      userId: assignment.userId,
      displayName: user.displayName,
      characterId: character.id,
      characterName: character.name,
    })
    .from(assignment)
    .innerJoin(user, eq(user.id, assignment.userId))
    .innerJoin(character, eq(character.id, assignment.characterId))
    .where(eq(assignment.raidId, raidId));

  const assignmentOnlyBySignupId = new Map<
    string,
    {
      signupId: string;
      status: "SETUP_ONLY";
      userId: string;
      displayName: string;
      characterNames: string[];
      characterIds: string[];
    }
  >();
  for (const row of assignmentOnlyRows) {
    if (signedUpUserIds.has(row.userId)) continue; // má vlastní signup, už je v rosterBySignupId
    // Pseudo-signupId (žádný signup neexistuje) — jen ať má React klíč a shodná struktura.
    const pseudoId = `setup-only:${row.userId}`;
    const entry = assignmentOnlyBySignupId.get(pseudoId) ?? {
      signupId: pseudoId,
      status: "SETUP_ONLY" as const,
      userId: row.userId,
      displayName: row.displayName,
      characterNames: [],
      characterIds: [],
    };
    entry.characterNames.push(row.characterName);
    entry.characterIds.push(row.characterId);
    assignmentOnlyBySignupId.set(pseudoId, entry);
  }

  // Zobrazovací jméno hráče ostatním = jeho hlavní postava, jinak Discord displayName.
  const rosterEntries = [
    ...Array.from(rosterBySignupId.values()),
    ...Array.from(assignmentOnlyBySignupId.values()),
  ];
  const mainNames = await getMainCharacterNamesByUserId(rosterEntries.map((r) => r.userId));
  const roster = rosterEntries
    .map((r) => ({
      ...r,
      displayName: resolveDisplayName({ displayName: r.displayName }, mainNames.get(r.userId) ?? null),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const attendance = raidRow.status === "DONE" ? await getAttendanceRows(raidId) : [];

  return {
    raid: raidRow,
    myCharacters,
    mySignup: mySignup ?? null,
    mySignupCharacterIds,
    roster,
    attendance,
  };
}

export type AttendanceRow = {
  userId: string;
  displayName: string;
  assignmentStatus: (typeof assignment.status.enumValues)[number] | null;
  status: AttendanceStatus;
  note: string | null;
};

/** Řádky pro panel docházky (jen raid.status === DONE) — role badge ze assignment, jméno resolvnuté přes hlavní postavu. */
async function getAttendanceRows(raidId: string): Promise<AttendanceRow[]> {
  const rows = await db
    .select({
      userId: attendanceRecord.userId,
      displayName: user.displayName,
      status: attendanceRecord.status,
      note: attendanceRecord.note,
    })
    .from(attendanceRecord)
    .innerJoin(user, eq(user.id, attendanceRecord.userId))
    .where(eq(attendanceRecord.raidId, raidId))
    .orderBy(user.displayName);

  const assignmentRows = await db
    .select({ userId: assignment.userId, status: assignment.status })
    .from(assignment)
    .where(eq(assignment.raidId, raidId));
  const assignmentStatusByUserId = new Map(assignmentRows.map((a) => [a.userId, a.status]));

  const mainNames = await getMainCharacterNamesByUserId(rows.map((r) => r.userId));

  return rows.map((r) => ({
    userId: r.userId,
    displayName: resolveDisplayName({ displayName: r.displayName }, mainNames.get(r.userId) ?? null),
    assignmentStatus: assignmentStatusByUserId.get(r.userId) ?? null,
    status: r.status,
    note: r.note,
  }));
}

/** Upraví raid — jen RAID_LEADER/ADMIN, a jen dokud raid není v koncovém stavu. */
export async function updateRaid(raidId: string, formData: FormData) {
  await requireRaidLeader();
  const raidRow = await requireRaid(raidId);
  if (!isRaidEditable(raidRow.status)) {
    throw new Error(`Raid ve stavu ${raidRow.status} už nelze upravovat.`);
  }
  const values = readRaidForm(formData);

  await db.update(raid).set(values).where(eq(raid.id, raidId));
  revalidatePath("/raids");
  revalidatePath(`/raids/${raidId}`);
}

/**
 * Seeduje počáteční docházku pro roster raidu (distinct userId z assignmentů,
 * CONFIRMED i BENCH) — voláno výhradně z `setRaidStatus` uvnitř přechodu do
 * DONE, ve stejné transakci jako update stavu. Idempotentní (on conflict do
 * nothing), takže opakovaný přechod DONE nepřepíše ruční úpravy RL.
 */
async function seedAttendanceForRaid(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  raidRow: typeof raid.$inferSelect,
  recordedById: string,
) {
  const rosterRows = await tx
    .selectDistinct({ userId: assignment.userId })
    .from(assignment)
    .where(eq(assignment.raidId, raidRow.id));
  const rosterUserIds = rosterRows.map((r) => r.userId);
  if (rosterUserIds.length === 0) return;

  const absenceRows = await tx
    .select({ userId: absence.userId, fromDate: absence.fromDate, toDate: absence.toDate, note: absence.note })
    .from(absence)
    .where(and(inArray(absence.userId, rosterUserIds), isNull(absence.deletedAt)));

  const absencesByUser = new Map<string, SeedAbsenceRange[]>();
  for (const row of absenceRows) {
    const list = absencesByUser.get(row.userId) ?? [];
    list.push({ fromDate: row.fromDate, toDate: row.toDate, note: row.note });
    absencesByUser.set(row.userId, list);
  }

  const pragueDateKey = toPragueDateKey(raidRow.startsAt);
  const seeded = deriveSeededAttendance(rosterUserIds, absencesByUser, pragueDateKey);

  for (const entry of seeded) {
    await tx
      .insert(attendanceRecord)
      .values({
        raidId: raidRow.id,
        userId: entry.userId,
        status: entry.status,
        note: entry.note,
        source: "MANUAL",
        recordedBy: recordedById,
      })
      .onConflictDoNothing({ target: [attendanceRecord.raidId, attendanceRecord.userId] });
  }

  // Přímo tx.insert místo logAudit() — tenhle záznam musí být součástí stejné
  // transakce jako seedování, logAudit() píše přes `db`, ne přes `tx`.
  await tx.insert(auditLog).values({
    actorId: recordedById,
    action: "attendance_seeded",
    targetType: "raid",
    targetId: raidRow.id,
    description: `Docházka vygenerována (${rosterUserIds.length} hráčů).`,
  });
}

/** Ruční přechod stavu raidu (LOCKED/DONE/CANCELLED/znovu OPEN) — jen RAID_LEADER/ADMIN. */
export async function setRaidStatus(raidId: string, status: RaidStatus) {
  const appUser = await requireRaidLeader();
  const raidRow = await requireRaid(raidId);

  if (!canTransitionRaidStatus(raidRow.status, status)) {
    throw new Error(`Přechod ${raidRow.status} -> ${status} není povolen.`);
  }

  await db.transaction(async (tx) => {
    await tx.update(raid).set({ status }).where(eq(raid.id, raidId));
    if (status === "DONE") {
      await seedAttendanceForRaid(tx, raidRow, appUser.id);
    }
  });

  await logAudit({
    actorId: appUser.id,
    action: "raid_status_changed",
    targetType: "raid",
    targetId: raidId,
    description: `${raidRow.instance}: ${raidRow.status} -> ${status}`,
  });
  revalidatePath("/raids");
  revalidatePath(`/raids/${raidId}`);
}

/** Ruční značení docházky (6 stavů) — jen RAID_LEADER/ADMIN, kdykoli po vzniku raidu. */
export async function setAttendance(
  raidId: string,
  userId: string,
  status: AttendanceStatus,
  note?: string | null,
) {
  const appUser = await requireRaidLeader();
  await requireRaid(raidId);

  const [userRow] = await db.select({ displayName: user.displayName }).from(user).where(eq(user.id, userId)).limit(1);

  await db
    .insert(attendanceRecord)
    .values({
      raidId,
      userId,
      status,
      note: note?.trim() || null,
      recordedBy: appUser.id,
    })
    .onConflictDoUpdate({
      target: [attendanceRecord.raidId, attendanceRecord.userId],
      set: { status, note: note?.trim() || null, recordedBy: appUser.id, recordedAt: new Date() },
    });

  await logAudit({
    actorId: appUser.id,
    action: "attendance_marked",
    targetType: "raid",
    targetId: raidId,
    description: `${userRow?.displayName ?? userId}: ${status}`,
  });
  revalidatePath(`/raids/${raidId}`);
}

/** Vytvoří nebo přepíše signup přihlášeného hráče na raid a jeho pool postav. */
export async function submitSignup(raidId: string, formData: FormData) {
  const appUser = await requireAppUser();
  const raidRow = await requireRaid(raidId);

  if (raidRow.status !== "OPEN") {
    throw new Error("Raid není otevřený pro přihlašování.");
  }

  const statusValue = String(formData.get("status") ?? "");
  if (!SIGNUP_STATUSES.includes(statusValue as (typeof SIGNUP_STATUSES)[number])) {
    throw new Error("Neplatný status.");
  }
  const status = statusValue as (typeof SIGNUP_STATUSES)[number];

  const characterIds = Array.from(new Set(formData.getAll("characterIds").map(String).filter(Boolean)));

  // Rozhodnutí 2 (app-level): mimo ABSENT je potřeba alespoň jedna postava.
  if (status !== "ABSENT" && characterIds.length === 0) {
    throw new Error("Vyber alespoň jednu postavu.");
  }
  if (raidRow.signupMode === "SINGLE" && characterIds.length > 1) {
    throw new Error("SINGLE mód: vyber jen jednu postavu.");
  }

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(signup)
      .where(and(eq(signup.raidId, raidId), eq(signup.userId, appUser.id)))
      .limit(1);

    const [signupRow] = existing
      ? await tx.update(signup).set({ status }).where(eq(signup.id, existing.id)).returning()
      : await tx.insert(signup).values({ raidId, userId: appUser.id, status }).returning();

    // Přepočet poolu od nuly — jednodušší a spolehlivější než diff; triggery
    // signup_character_validate / SINGLE-count hlídají vlastnictví a limit.
    await tx.delete(signupCharacter).where(eq(signupCharacter.signupId, signupRow.id));
    for (const characterId of characterIds) {
      await tx.insert(signupCharacter).values({ signupId: signupRow.id, characterId });
    }
  });

  revalidatePath(`/raids/${raidId}`);
}

/** Zruší (withdraw) signup přihlášeného hráče na raid — smaže jen jeho vlastní řádek. */
export async function withdrawSignup(raidId: string) {
  const appUser = await requireAppUser();

  const [existing] = await db
    .select()
    .from(signup)
    .where(and(eq(signup.raidId, raidId), eq(signup.userId, appUser.id)))
    .limit(1);
  if (!existing) throw new Error("Signup nenalezen.");

  await db.delete(signup).where(eq(signup.id, existing.id));
  revalidatePath(`/raids/${raidId}`);
}

/**
 * Oznámí raid do Discordu (jeden sdílený kanál guildy, `DISCORD_RAID_WEBHOOK_URL`
 * — TODO(multi-room): časem víc kanálů → přejít z env na tabulku kanálů).
 * Dostupné od stavu OPEN (ne DRAFT). Počet přihlášených je STATICKÝ k okamžiku
 * odeslání — při další publikaci (message id už existuje) se zpráva EDITUJE
 * (osvěží počet), nevytváří se nová.
 */
export async function announceRaidToDiscord(raidId: string): Promise<{ ok: boolean; error?: string }> {
  const appUser = await requireRaidLeader();
  const raidRow = await requireRaid(raidId);

  if (raidRow.status === "DRAFT") {
    return { ok: false, error: "Raid musí být aspoň OPEN, než ho lze oznámit." };
  }

  const webhookUrl = process.env.DISCORD_RAID_WEBHOOK_URL;
  if (!webhookUrl) {
    return { ok: false, error: "DISCORD_RAID_WEBHOOK_URL není nastavené." };
  }

  const signupRows = await db.select({ id: signup.id }).from(signup).where(eq(signup.raidId, raidId));
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const content = buildAnnouncementContent({
    instance: raidRow.instance,
    dateLabel: formatRaidDateTimeLabel(raidRow.startsAt),
    signupCount: signupRows.length,
    raidUrl: `${siteUrl}/raids/${raidId}`,
  });
  // @here je uvnitř content (plaintext), ne v embedu — embed samotný by nepingnul.
  const payload: DiscordMessagePayload = { content, allowed_mentions: { parse: ["everyone"] } };

  let ok: boolean;
  let error: string | undefined;
  if (raidRow.discordAnnouncementMessageId) {
    ok = await editDiscordMessage(webhookUrl, raidRow.discordAnnouncementMessageId, payload);
    if (!ok) error = "Editace Discord zprávy selhala.";
  } else {
    const posted = await postDiscordMessage(webhookUrl, payload);
    if (posted) {
      await db.update(raid).set({ discordAnnouncementMessageId: posted.id }).where(eq(raid.id, raidId));
      ok = true;
    } else {
      ok = false;
      error = "Odeslání Discord zprávy selhalo.";
    }
  }

  if (ok) {
    await logAudit({
      actorId: appUser.id,
      action: "raid_announced_discord",
      targetType: "raid",
      targetId: raidId,
      description: `${raidRow.instance}: oznámeno na Discordu (${signupRows.length} přihlášených).`,
    });
  }
  revalidatePath(`/raids/${raidId}`);
  return ok ? { ok: true } : { ok: false, error };
}
