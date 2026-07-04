"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  assignment,
  character,
  raid,
  signup,
  signupCharacter,
  user,
  type Assignment,
} from "@/db/schema";
import { canManageRaids, getCurrentAppUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { findConflictedAssignments } from "@/lib/absence-conflicts";
import { isRaidEditable } from "../../raid-status";
import { assertValidGroupNo, SLOTS_PER_GROUP } from "./setup-validation";

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

async function requireEditableRaid(raidId: string) {
  const [row] = await db.select().from(raid).where(eq(raid.id, raidId)).limit(1);
  if (!row) throw new Error("Raid nenalezen.");
  if (!isRaidEditable(row.status)) {
    throw new Error(`Raid ve stavu ${row.status} už nelze editovat.`);
  }
  return row;
}

/** Mapuje Postgres chyby z triggerů/exclusion constraintu na srozumitelnou hlášku pro RL. */
function friendlyAssignmentError(err: unknown): Error {
  const code = (err as { code?: string } | null | undefined)?.code;
  if (code === "23P01") {
    return new Error("Postava už je CONFIRMED v jiném raidu ve stejném čase.");
  }
  if (code === "P0001") {
    const message = (err as { message?: string } | null | undefined)?.message;
    return new Error(message || "DB odmítla přiřazení.");
  }
  return err instanceof Error ? err : new Error("Něco se pokazilo.");
}

export type RosterCharacter = {
  characterId: string;
  characterName: string;
  characterClass: string;
  characterRole: (typeof character.role.enumValues)[number];
  userId: string;
  displayName: string;
  signupStatus: (typeof signup.status.enumValues)[number] | null;
  inSignupPool: boolean;
};

export type SetupData = {
  raid: typeof raid.$inferSelect;
  roster: RosterCharacter[];
  assignments: Assignment[];
  conflictedAssignmentIds: string[];
};

/**
 * Data pro setup builder: raid, roster přihlášených postav (signup_character
 * napříč signupy se statusem YES/LATE/TENTATIVE — ABSENT se nepočítá) a
 * existující assignmenty. Roster navíc dotáhne i postavy, které jsou
 * přiřazené, ale mezitím vypadly z poolu (hráč přepsal/stáhl signup) — ať
 * builder nespadne na chybějící data.
 */
export async function getSetupData(raidId: string): Promise<SetupData> {
  await requireRaidLeader();
  const [raidRow] = await db.select().from(raid).where(eq(raid.id, raidId)).limit(1);
  if (!raidRow) throw new Error("Raid nenalezen.");

  const poolRows = await db
    .select({
      characterId: character.id,
      characterName: character.name,
      characterClass: character.class,
      characterRole: character.role,
      userId: user.id,
      displayName: user.displayName,
      signupStatus: signup.status,
    })
    .from(signupCharacter)
    .innerJoin(signup, eq(signup.id, signupCharacter.signupId))
    .innerJoin(character, eq(character.id, signupCharacter.characterId))
    .innerJoin(user, eq(user.id, signup.userId))
    .where(
      and(
        eq(signup.raidId, raidId),
        inArray(signup.status, ["YES", "LATE", "TENTATIVE"]),
        isNull(character.deletedAt),
      ),
    )
    .orderBy(user.displayName, character.name);

  const assignmentRows = await db.select().from(assignment).where(eq(assignment.raidId, raidId));

  const poolCharacterIds = new Set(poolRows.map((r) => r.characterId));
  const missingCharacterIds = [
    ...new Set(
      assignmentRows.map((a) => a.characterId).filter((id) => !poolCharacterIds.has(id)),
    ),
  ];

  const extraRows =
    missingCharacterIds.length > 0
      ? await db
          .select({
            characterId: character.id,
            characterName: character.name,
            characterClass: character.class,
            characterRole: character.role,
            userId: user.id,
            displayName: user.displayName,
          })
          .from(character)
          .innerJoin(user, eq(user.id, character.userId))
          .where(inArray(character.id, missingCharacterIds))
      : [];

  const roster: RosterCharacter[] = [
    ...poolRows.map((r) => ({ ...r, inSignupPool: true })),
    ...extraRows.map((r) => ({ ...r, signupStatus: null, inSignupPool: false })),
  ];

  const conflicts = await findConflictedAssignments({ raidId });

  return {
    raid: raidRow,
    roster,
    assignments: assignmentRows,
    conflictedAssignmentIds: conflicts.map((c) => c.assignmentId),
  };
}

function revalidateSetup(raidId: string) {
  revalidatePath(`/raids/${raidId}/setup`);
  revalidatePath(`/raids/${raidId}`);
  revalidatePath("/raids");
}

/** Zkontroluje, že hráč v tomto raidu ještě nemá přiřazenou jinou postavu (1 hráč = 1 postava/raid). */
async function assertNoOtherCharacterForUser(raidId: string, userId: string, characterId: string) {
  const existing = await db
    .select({ characterId: assignment.characterId })
    .from(assignment)
    .where(and(eq(assignment.raidId, raidId), eq(assignment.userId, userId)));

  if (existing.some((r) => r.characterId !== characterId)) {
    throw new Error("Hráč už má v tomto raidu přiřazenou jinou postavu.");
  }
}

/** Přiřadí postavu do skupiny jako CONFIRMED (upsert podle raid_id+character_id). */
export async function assignToGroup(
  raidId: string,
  characterId: string,
  userId: string,
  groupNo: number,
) {
  const appUser = await requireRaidLeader();
  assertValidGroupNo(groupNo);
  await requireEditableRaid(raidId);
  await assertNoOtherCharacterForUser(raidId, userId, characterId);

  const [characterRow] = await db
    .select()
    .from(character)
    .where(eq(character.id, characterId))
    .limit(1);
  if (!characterRow || characterRow.deletedAt) throw new Error("Postava nenalezena.");

  const groupOccupants = await db
    .select({ characterId: assignment.characterId })
    .from(assignment)
    .where(
      and(
        eq(assignment.raidId, raidId),
        eq(assignment.groupNo, groupNo),
        eq(assignment.status, "CONFIRMED"),
      ),
    );
  const otherOccupants = groupOccupants.filter((r) => r.characterId !== characterId).length;
  if (otherOccupants >= SLOTS_PER_GROUP) {
    throw new Error(`Skupina ${groupNo} je plná (${SLOTS_PER_GROUP}/${SLOTS_PER_GROUP}).`);
  }

  try {
    await db
      .insert(assignment)
      .values({
        raidId,
        characterId,
        userId,
        roleInRaid: characterRow.role,
        groupNo,
        status: "CONFIRMED",
        // Placeholder — VÝHRADNĚ trigger assignment_fill_raid_time přepíše
        // starts_at/ends_at ze zdrojového raidu při každém insert/update.
        startsAt: new Date(0),
        endsAt: new Date(0),
      })
      .onConflictDoUpdate({
        target: [assignment.raidId, assignment.characterId],
        set: { userId, roleInRaid: characterRow.role, groupNo, status: "CONFIRMED" },
      });
  } catch (err) {
    throw friendlyAssignmentError(err);
  }

  await logAudit({
    actorId: appUser.id,
    action: "character_assigned_confirmed",
    targetType: "assignment",
    targetId: characterId,
    description: `${characterRow.name} -> skupina ${groupNo} (raid ${raidId}).`,
  });
  revalidateSetup(raidId);
}

/** Pošle postavu na bench (status BENCH, bez skupiny). */
export async function benchCharacter(raidId: string, characterId: string, userId: string) {
  const appUser = await requireRaidLeader();
  await requireEditableRaid(raidId);
  await assertNoOtherCharacterForUser(raidId, userId, characterId);

  const [characterRow] = await db
    .select()
    .from(character)
    .where(eq(character.id, characterId))
    .limit(1);
  if (!characterRow || characterRow.deletedAt) throw new Error("Postava nenalezena.");

  try {
    await db
      .insert(assignment)
      .values({
        raidId,
        characterId,
        userId,
        roleInRaid: characterRow.role,
        groupNo: null,
        status: "BENCH",
        startsAt: new Date(0),
        endsAt: new Date(0),
      })
      .onConflictDoUpdate({
        target: [assignment.raidId, assignment.characterId],
        set: { userId, roleInRaid: characterRow.role, groupNo: null, status: "BENCH" },
      });
  } catch (err) {
    throw friendlyAssignmentError(err);
  }

  await logAudit({
    actorId: appUser.id,
    action: "character_benched",
    targetType: "assignment",
    targetId: characterId,
    description: `${characterRow.name} -> bench (raid ${raidId}).`,
  });
  revalidateSetup(raidId);
}

/** Odebere postavu ze setupu (z mřížky i z benche). */
export async function removeAssignment(raidId: string, characterId: string) {
  const appUser = await requireRaidLeader();
  await requireEditableRaid(raidId);

  const [existing] = await db
    .select()
    .from(assignment)
    .where(and(eq(assignment.raidId, raidId), eq(assignment.characterId, characterId)))
    .limit(1);
  if (!existing) return;

  await db
    .delete(assignment)
    .where(and(eq(assignment.raidId, raidId), eq(assignment.characterId, characterId)));

  await logAudit({
    actorId: appUser.id,
    action: "character_removed_from_setup",
    targetType: "assignment",
    targetId: characterId,
    description: `Postava odebrána ze setupu (raid ${raidId}).`,
  });
  revalidateSetup(raidId);
}
