"use server";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { user, character, raid, signup, assignment, attendanceRecord } from "@/db/schema";
import { canAccessNotes, getCurrentAppUser } from "@/lib/auth";
import { getAttendanceRowsInPeriod } from "@/lib/attendance-query";
import { computeAttendanceStats, type AttendanceStats } from "@/lib/attendance-stats";
import { getNotesForSubject, getNoteRevisions, type NoteWithContext, type NoteRevisionRow } from "@/lib/notes-query";
import { getMainCharactersByUserId } from "@/lib/main-character";
import { resolveDisplayName } from "@/lib/display-name";
import type { PeriodFilter } from "@/lib/period-filter";
import type { GuildRankValue } from "../actions";

async function requireLeadership() {
  const appUser = await getCurrentAppUser();
  if (!appUser) throw new Error("Nepřihlášeno.");
  if (!canAccessNotes(appUser)) throw new Error("Nedostatečná oprávnění.");
  return appUser;
}

export type DossierCharacterOption = { id: string; name: string };
export type DossierRaidOption = { id: string; instance: string; startsAt: Date };

export type DossierData = {
  subjectUserId: string;
  currentUserId: string;
  displayName: string;
  guildRank: GuildRankValue | null;
  mainCharacterClass: string | null;
  stats: AttendanceStats;
  notes: NoteWithContext[];
  characterOptions: DossierCharacterOption[];
  raidOptions: DossierRaidOption[];
};

/**
 * Data pro dossier hráče — stejný filtr období jako `/players/[userId]`, ale
 * NEIMPORTUJE tamní actions.ts (hard rule): docházku počítá vlastním voláním
 * `getAttendanceRowsInPeriod` + `computeAttendanceStats`, žádná nová logika metrik.
 */
export async function getDossierData(subjectUserId: string, period: PeriodFilter): Promise<DossierData> {
  const appUser = await requireLeadership();

  const [userRow] = await db
    .select({ id: user.id, displayName: user.displayName, guildRank: user.guildRank })
    .from(user)
    .where(eq(user.id, subjectUserId))
    .limit(1);
  if (!userRow) throw new Error("Hráč nenalezen.");

  const mainChar = (await getMainCharactersByUserId([subjectUserId])).get(subjectUserId);

  const attendanceRows = await getAttendanceRowsInPeriod(period, { userId: subjectUserId });
  const stats = computeAttendanceStats(attendanceRows.map((r) => ({ status: r.status, role: r.role })));

  const notes = await getNotesForSubject(subjectUserId, appUser.id);

  const characterOptions = await db
    .select({ id: character.id, name: character.name })
    .from(character)
    .where(and(eq(character.userId, subjectUserId), isNull(character.deletedAt)))
    .orderBy(character.name);

  // Raidy, kde hráč "figuruje" — signup, assignment nebo attendance, sjednocené.
  const [signupRaidIds, assignmentRaidIds, attendanceRaidIds] = await Promise.all([
    db.select({ raidId: signup.raidId }).from(signup).where(eq(signup.userId, subjectUserId)),
    db.select({ raidId: assignment.raidId }).from(assignment).where(eq(assignment.userId, subjectUserId)),
    db
      .select({ raidId: attendanceRecord.raidId })
      .from(attendanceRecord)
      .where(eq(attendanceRecord.userId, subjectUserId)),
  ]);
  const raidIds = [
    ...new Set([...signupRaidIds, ...assignmentRaidIds, ...attendanceRaidIds].map((r) => r.raidId)),
  ];
  const raidOptions =
    raidIds.length > 0
      ? await db
          .select({ id: raid.id, instance: raid.instance, startsAt: raid.startsAt })
          .from(raid)
          .where(inArray(raid.id, raidIds))
          .orderBy(desc(raid.startsAt))
      : [];

  return {
    subjectUserId,
    currentUserId: appUser.id,
    displayName: resolveDisplayName({ displayName: userRow.displayName }, mainChar?.name ?? null),
    guildRank: userRow.guildRank,
    mainCharacterClass: mainChar?.class ?? null,
    stats,
    notes,
    characterOptions,
    raidOptions,
  };
}

/** Revize konkrétní poznámky, jen na vyžádání (rozbalovací historie v UI). */
export async function fetchNoteRevisions(noteId: string): Promise<NoteRevisionRow[]> {
  const appUser = await requireLeadership();
  return getNoteRevisions(noteId, appUser.id);
}
