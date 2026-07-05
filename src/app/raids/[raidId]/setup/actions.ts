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
import { findAbsentUserIdsForRaid, findConflictedAssignments } from "@/lib/absence-conflicts";
import { findUsersConfirmedElsewhere, type BusyElsewhere } from "@/lib/character-availability";
import { editDiscordMessage, postDiscordMessage, type DiscordMessagePayload } from "@/lib/discord-webhook";
import { resolveDisplayName } from "@/lib/display-name";
import { formatRaidDateTimeLabel } from "@/lib/local-date";
import { getMainCharacterNamesByUserId } from "@/lib/main-character";
import {
  buildSetupChangeNoticeContent,
  buildSetupEmbed,
  buildSetupPingContent,
  diffSetupSnapshots,
  type DiscordSetupSnapshotEntry,
  type SetupEmbedGroup,
} from "./discord-setup-embed";
import { isRaidEditable } from "../../raid-status";
import { assertValidGroupNo, assertValidSlotNo } from "./setup-validation";

export type CharRole = (typeof character.role.enumValues)[number];

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

/**
 * Mapuje chyby z triggerů/exclusion constraintu na srozumitelnou hlášku pro RL.
 * Drizzle (postgres-js driver) balí skutečnou Postgres chybu do DrizzleQueryError —
 * jeho vlastní `.message` je jen dump SQL dotazu, `.code` je `undefined`. Reálný
 * `code`/`message` (ten z `RAISE EXCEPTION`/exclusion constraintu) je v `err.cause`.
 */
function friendlyAssignmentError(err: unknown): Error {
  const cause = (err as { cause?: unknown } | null | undefined)?.cause;
  const causeInfo = cause as { code?: string; message?: string } | null | undefined;
  const code = causeInfo?.code ?? (err as { code?: string } | null | undefined)?.code;

  if (code === "23P01") {
    return new Error("Postava už je CONFIRMED v jiném raidu ve stejném čase.");
  }
  if (code === "P0001") {
    return new Error(causeInfo?.message || "Hráč má absenci pokrývající termín raidu.");
  }
  return new Error("Přiřazení se nepodařilo uložit.");
}

export type RosterCharacter = {
  characterId: string;
  characterName: string;
  characterClass: string;
  characterRole: CharRole;
  userId: string;
  displayName: string;
  signupStatus: (typeof signup.status.enumValues)[number] | null;
  inSignupPool: boolean;
};

export type SetupData = {
  raid: typeof raid.$inferSelect;
  roster: RosterCharacter[];
  otherCharacters: RosterCharacter[];
  assignments: Assignment[];
  conflictedAssignmentIds: string[];
  busyElsewhere: BusyElsewhere[];
  absentUserIds: string[];
};

const CHARACTER_SELECT_SHAPE = {
  characterId: character.id,
  characterName: character.name,
  characterClass: character.class,
  characterRole: character.role,
  userId: user.id,
  displayName: user.displayName,
};

/**
 * Data pro setup builder: raid, roster přihlášených postav (signup_character
 * napříč signupy se statusem YES/LATE/TENTATIVE — ABSENT se nepočítá),
 * existující assignmenty a `otherCharacters` — všechny ostatní raid-ready
 * postavy v appce, které se nepřihlásily (RL může sáhnout mimo signup, když
 * shání náhradu za absenci). Roster navíc dotáhne i postavy, které jsou
 * přiřazené, ale mezitím vypadly z poolu (hráč přepsal/stáhl signup) — ať
 * builder nespadne na chybějící data.
 */
export async function getSetupData(raidId: string): Promise<SetupData> {
  await requireRaidLeader();
  const [raidRow] = await db.select().from(raid).where(eq(raid.id, raidId)).limit(1);
  if (!raidRow) throw new Error("Raid nenalezen.");

  const poolRows = await db
    .select({ ...CHARACTER_SELECT_SHAPE, signupStatus: signup.status })
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
          .select(CHARACTER_SELECT_SHAPE)
          .from(character)
          .innerJoin(user, eq(user.id, character.userId))
          .where(inArray(character.id, missingCharacterIds))
      : [];

  const roster: RosterCharacter[] = [
    ...poolRows.map((r) => ({ ...r, inSignupPool: true })),
    ...extraRows.map((r) => ({ ...r, signupStatus: null, inSignupPool: false })),
  ];

  const rosterCharacterIds = new Set(roster.map((r) => r.characterId));
  const allReadyRows = await db
    .select(CHARACTER_SELECT_SHAPE)
    .from(character)
    .innerJoin(user, eq(user.id, character.userId))
    .where(and(eq(character.isRaidReady, true), isNull(character.deletedAt)))
    .orderBy(user.displayName, character.name);
  const otherCharacters: RosterCharacter[] = allReadyRows
    .filter((r) => !rosterCharacterIds.has(r.characterId))
    .map((r) => ({ ...r, signupStatus: null, inSignupPool: false }));

  // Zobrazovací jméno hráče ostatním = jeho hlavní postava, jinak Discord displayName.
  const mainNames = await getMainCharacterNamesByUserId([
    ...new Set([...roster, ...otherCharacters].map((c) => c.userId)),
  ]);
  const resolveRosterCharacter = (r: RosterCharacter): RosterCharacter => ({
    ...r,
    displayName: resolveDisplayName({ displayName: r.displayName }, mainNames.get(r.userId) ?? null),
  });
  const resolvedRoster = roster.map(resolveRosterCharacter);
  const resolvedOtherCharacters = otherCharacters.map(resolveRosterCharacter);

  const conflicts = await findConflictedAssignments({ raidId });

  const allUserIds = [...new Set([...roster, ...otherCharacters].map((c) => c.userId))];
  const busyElsewhere = await findUsersConfirmedElsewhere(
    raidId,
    raidRow.startsAt,
    raidRow.endsAt,
    allUserIds,
  );
  const absentUserIds = await findAbsentUserIdsForRaid(raidRow.startsAt, allUserIds);

  return {
    raid: raidRow,
    roster: resolvedRoster,
    otherCharacters: resolvedOtherCharacters,
    assignments: assignmentRows,
    conflictedAssignmentIds: conflicts.map((c) => c.assignmentId),
    busyElsewhere,
    absentUserIds: [...absentUserIds],
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

async function requireCharacter(characterId: string) {
  const [row] = await db.select().from(character).where(eq(character.id, characterId)).limit(1);
  if (!row || row.deletedAt) throw new Error("Postava nenalezena.");
  return row;
}

/** Přiřadí postavu na konkrétní (skupina, slot) jako CONFIRMED — upsert podle raid_id+character_id. */
export async function assignToGroup(
  raidId: string,
  characterId: string,
  userId: string,
  groupNo: number,
  slotNo: number,
  roleInRaid?: CharRole,
) {
  const appUser = await requireRaidLeader();
  assertValidGroupNo(groupNo);
  assertValidSlotNo(slotNo);
  await requireEditableRaid(raidId);
  await assertNoOtherCharacterForUser(raidId, userId, characterId);

  const characterRow = await requireCharacter(characterId);

  const [occupant] = await db
    .select({ characterId: assignment.characterId })
    .from(assignment)
    .where(
      and(
        eq(assignment.raidId, raidId),
        eq(assignment.groupNo, groupNo),
        eq(assignment.slotNo, slotNo),
        eq(assignment.status, "CONFIRMED"),
      ),
    )
    .limit(1);
  if (occupant && occupant.characterId !== characterId) {
    throw new Error(`Slot ${slotNo} ve skupině ${groupNo} je obsazený.`);
  }

  const finalRole = roleInRaid ?? characterRow.role;

  try {
    await db
      .insert(assignment)
      .values({
        raidId,
        characterId,
        userId,
        roleInRaid: finalRole,
        groupNo,
        slotNo,
        status: "CONFIRMED",
        // Placeholder — VÝHRADNĚ trigger assignment_fill_raid_time přepíše
        // starts_at/ends_at ze zdrojového raidu při každém insert/update.
        startsAt: new Date(0),
        endsAt: new Date(0),
      })
      .onConflictDoUpdate({
        target: [assignment.raidId, assignment.characterId],
        set: { userId, roleInRaid: finalRole, groupNo, slotNo, status: "CONFIRMED" },
      });
  } catch (err) {
    throw friendlyAssignmentError(err);
  }

  await logAudit({
    actorId: appUser.id,
    action: "character_assigned_confirmed",
    targetType: "assignment",
    targetId: characterId,
    description: `${characterRow.name} -> skupina ${groupNo}, slot ${slotNo} (raid ${raidId}).`,
  });
  revalidateSetup(raidId);
}

/** Pošle postavu na bench (status BENCH, bez skupiny/slotu). */
export async function benchCharacter(
  raidId: string,
  characterId: string,
  userId: string,
  roleInRaid?: CharRole,
) {
  const appUser = await requireRaidLeader();
  await requireEditableRaid(raidId);
  await assertNoOtherCharacterForUser(raidId, userId, characterId);

  const characterRow = await requireCharacter(characterId);
  const finalRole = roleInRaid ?? characterRow.role;

  try {
    await db
      .insert(assignment)
      .values({
        raidId,
        characterId,
        userId,
        roleInRaid: finalRole,
        groupNo: null,
        slotNo: null,
        status: "BENCH",
        startsAt: new Date(0),
        endsAt: new Date(0),
      })
      .onConflictDoUpdate({
        target: [assignment.raidId, assignment.characterId],
        set: { userId, roleInRaid: finalRole, groupNo: null, slotNo: null, status: "BENCH" },
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

/** Prohodí pozice (skupina+slot) dvou už přiřazených CONFIRMED postav v mřížce. */
export async function swapAssignments(raidId: string, characterIdA: string, characterIdB: string) {
  const appUser = await requireRaidLeader();
  await requireEditableRaid(raidId);
  if (characterIdA === characterIdB) return;

  await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(assignment)
      .where(
        and(
          eq(assignment.raidId, raidId),
          inArray(assignment.characterId, [characterIdA, characterIdB]),
        ),
      );
    const a = rows.find((r) => r.characterId === characterIdA);
    const b = rows.find((r) => r.characterId === characterIdB);
    if (!a || !b) throw new Error("Obě postavy musí být v setupu přiřazené.");
    if (a.groupNo === null || b.groupNo === null || a.slotNo === null || b.slotNo === null) {
      throw new Error("Prohodit lze jen postavy umístěné v mřížce.");
    }

    await tx
      .update(assignment)
      .set({ groupNo: b.groupNo, slotNo: b.slotNo })
      .where(eq(assignment.id, a.id));
    await tx
      .update(assignment)
      .set({ groupNo: a.groupNo, slotNo: a.slotNo })
      .where(eq(assignment.id, b.id));
  });

  await logAudit({
    actorId: appUser.id,
    action: "assignment_positions_swapped",
    targetType: "assignment",
    targetId: raidId,
    description: `Prohozeny pozice postav ${characterIdA} a ${characterIdB} (raid ${raidId}).`,
  });
  revalidateSetup(raidId);
}

/** Změní roli (spec) přiřazené postavy v tomto raidu, beze změny pozice. */
export async function setAssignmentRole(raidId: string, characterId: string, roleInRaid: CharRole) {
  const appUser = await requireRaidLeader();
  await requireEditableRaid(raidId);

  const [existing] = await db
    .select()
    .from(assignment)
    .where(and(eq(assignment.raidId, raidId), eq(assignment.characterId, characterId)))
    .limit(1);
  if (!existing) throw new Error("Postava není v setupu přiřazená.");

  await db
    .update(assignment)
    .set({ roleInRaid })
    .where(and(eq(assignment.raidId, raidId), eq(assignment.characterId, characterId)));

  await logAudit({
    actorId: appUser.id,
    action: "assignment_role_changed",
    targetType: "assignment",
    targetId: characterId,
    description: `Role v raidu změněna na ${roleInRaid} (raid ${raidId}).`,
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

/** Poznámka k setupu — jen znovupoužívá existující raid.notes, editovatelné přímo ze setup builderu. */
export async function updateSetupNotes(raidId: string, note: string) {
  const appUser = await requireRaidLeader();
  await requireEditableRaid(raidId);

  await db
    .update(raid)
    .set({ notes: note.trim() || null })
    .where(eq(raid.id, raidId));

  await logAudit({
    actorId: appUser.id,
    action: "setup_notes_updated",
    targetType: "raid",
    targetId: raidId,
    description: `Poznámka k setupu upravena (raid ${raidId}).`,
  });
  revalidatePath(`/raids/${raidId}/setup`);
  revalidatePath(`/raids/${raidId}`);
}

/**
 * Publikuje hotový setup do Discordu (jeden sdílený kanál, `DISCORD_RAID_WEBHOOK_URL`
 * — stejný env jako oznámení raidu). Jen v `LOCKED`, jinak setup ještě není
 * finální. První publikace pošle novou zprávu, každá další EDITUJE tu samou
 * (message id v `raid.discordSetupMessageId`) a navíc pošle fire-and-forget
 * změnovou zprávu (ČÁST C) podle diffu proti uloženému snapshotu.
 */
export async function publishSetupToDiscord(raidId: string): Promise<{ ok: boolean; error?: string }> {
  const appUser = await requireRaidLeader();

  const [raidRow] = await db.select().from(raid).where(eq(raid.id, raidId)).limit(1);
  if (!raidRow) return { ok: false, error: "Raid nenalezen." };
  if (raidRow.status !== "LOCKED") {
    return { ok: false, error: "Setup lze publikovat, jen když je raid LOCKED." };
  }

  const webhookUrl = process.env.DISCORD_RAID_WEBHOOK_URL;
  if (!webhookUrl) {
    return { ok: false, error: "DISCORD_RAID_WEBHOOK_URL není nastavené." };
  }

  const assignmentRows = await db
    .select({
      userId: assignment.userId,
      discordId: user.discordId,
      displayName: user.displayName,
      characterName: character.name,
      characterClass: character.class,
      role: assignment.roleInRaid,
      status: assignment.status,
      groupNo: assignment.groupNo,
      slotNo: assignment.slotNo,
    })
    .from(assignment)
    .innerJoin(character, eq(character.id, assignment.characterId))
    .innerJoin(user, eq(user.id, assignment.userId))
    .where(eq(assignment.raidId, raidId));

  const signupRows = await db
    .select({
      signupId: signup.id,
      userId: signup.userId,
      status: signup.status,
      discordId: user.discordId,
      displayName: user.displayName,
    })
    .from(signup)
    .innerJoin(user, eq(user.id, signup.userId))
    .where(eq(signup.raidId, raidId));

  const lateSignupRows = signupRows.filter((r) => r.status === "LATE");
  const lateSignupIds = lateSignupRows.map((r) => r.signupId);
  const lateSignupCharacterRows =
    lateSignupIds.length > 0
      ? await db
          .select({ signupId: signupCharacter.signupId, characterName: character.name })
          .from(signupCharacter)
          .innerJoin(character, eq(character.id, signupCharacter.characterId))
          .where(inArray(signupCharacter.signupId, lateSignupIds))
      : [];
  const lateCharNamesBySignupId = new Map<string, string[]>();
  for (const r of lateSignupCharacterRows) {
    const list = lateCharNamesBySignupId.get(r.signupId) ?? [];
    list.push(r.characterName);
    lateCharNamesBySignupId.set(r.signupId, list);
  }

  const candidateUserIds = [
    ...new Set([...assignmentRows.map((r) => r.userId), ...signupRows.map((r) => r.userId)]),
  ];
  const mainNames = await getMainCharacterNamesByUserId(candidateUserIds);
  const absentUserIds = await findAbsentUserIdsForRaid(raidRow.startsAt, candidateUserIds);

  const assignmentByUserId = new Map(assignmentRows.map((r) => [r.userId, r]));
  const userInfoById = new Map<string, { discordId: string; displayName: string }>();
  for (const r of assignmentRows) userInfoById.set(r.userId, { discordId: r.discordId, displayName: r.displayName });
  for (const r of signupRows) userInfoById.set(r.userId, { discordId: r.discordId, displayName: r.displayName });

  const confirmedRows = assignmentRows.filter((r) => r.status === "CONFIRMED");
  const benchRows = assignmentRows.filter((r) => r.status === "BENCH");

  const confirmedByGroup = new Map<number, typeof confirmedRows>();
  for (const r of confirmedRows) {
    if (r.groupNo === null) continue;
    const list = confirmedByGroup.get(r.groupNo) ?? [];
    list.push(r);
    confirmedByGroup.set(r.groupNo, list);
  }
  const groups: SetupEmbedGroup[] = [...confirmedByGroup.entries()]
    .sort(([a], [b]) => a - b)
    .map(([groupNo, rows]) => ({
      groupNo,
      members: rows
        .slice()
        .sort((a, b) => (a.slotNo ?? 0) - (b.slotNo ?? 0))
        .map((r) => ({ characterName: r.characterName, characterClass: r.characterClass, role: r.role })),
    }));

  const benchMembers = benchRows.map((r) => ({
    characterName: r.characterName,
    characterClass: r.characterClass,
    role: r.role,
  }));

  // Edge case (viz zadání): LATE hráč bez přiřazení v ALL módu mohl nabídnout víc
  // postav (ořezaný pool) — nejde jednoznačně vybrat, kterou nakonec pojede, takže
  // místo hádání alta ukážeme jeho hlavní identitu. V SINGLE módu je pool přesně
  // jedna postava, tu použijeme přímo.
  const lateEntries = lateSignupRows.map((r) => {
    const existing = assignmentByUserId.get(r.userId);
    let name: string;
    if (existing) {
      name = existing.characterName;
    } else if (raidRow.signupMode === "SINGLE") {
      const chars = lateCharNamesBySignupId.get(r.signupId) ?? [];
      name = chars[0] ?? resolveDisplayName({ displayName: r.displayName }, mainNames.get(r.userId) ?? null);
    } else {
      name = resolveDisplayName({ displayName: r.displayName }, mainNames.get(r.userId) ?? null);
    }
    return { userId: r.userId, discordId: r.discordId, name };
  });

  const absenceEntries = [...absentUserIds].map((userId) => {
    const info = userInfoById.get(userId);
    return {
      userId,
      name: resolveDisplayName({ displayName: info?.displayName ?? "?" }, mainNames.get(userId) ?? null),
    };
  });

  const embed = buildSetupEmbed({
    raidInstance: raidRow.instance,
    raidDateLabel: formatRaidDateTimeLabel(raidRow.startsAt),
    groups,
    bench: benchMembers,
    late: lateEntries.map((l) => ({ name: l.name })),
    absence: absenceEntries.map((a) => ({ name: a.name })),
  });

  // Pingy (content) = CONFIRMED + BENCH + LATE. Absence se nepinguje.
  const participantDiscordIds = [
    ...new Set(
      [...confirmedRows, ...benchRows, ...lateEntries]
        .map((r) => r.discordId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const content = buildSetupPingContent(participantDiscordIds);
  const payload: DiscordMessagePayload = {
    content,
    embeds: [embed],
    allowed_mentions: { parse: ["users"] },
  };

  // Snapshot = jeden záznam na userId, priorita CONFIRMED > BENCH > LATE (diff
  // v ČÁSTI C se dívá jen na přítomnost userId, ne na state/groupNo).
  const nextSnapshot: DiscordSetupSnapshotEntry[] = [];
  const seenUserIds = new Set<string>();
  for (const r of confirmedRows) {
    seenUserIds.add(r.userId);
    nextSnapshot.push({
      userId: r.userId,
      discordId: r.discordId,
      name: r.characterName,
      state: "CONFIRMED",
      groupNo: r.groupNo,
    });
  }
  for (const r of benchRows) {
    if (seenUserIds.has(r.userId)) continue;
    seenUserIds.add(r.userId);
    nextSnapshot.push({ userId: r.userId, discordId: r.discordId, name: r.characterName, state: "BENCH", groupNo: null });
  }
  for (const l of lateEntries) {
    if (seenUserIds.has(l.userId)) continue;
    seenUserIds.add(l.userId);
    nextSnapshot.push({ userId: l.userId, discordId: l.discordId, name: l.name, state: "LATE", groupNo: null });
  }

  let ok: boolean;
  let error: string | undefined;

  if (!raidRow.discordSetupMessageId) {
    const posted = await postDiscordMessage(webhookUrl, payload);
    if (posted) {
      await db
        .update(raid)
        .set({ discordSetupMessageId: posted.id, discordSetupSnapshot: nextSnapshot })
        .where(eq(raid.id, raidId));
      ok = true;
    } else {
      ok = false;
      error = "Odeslání Discord zprávy selhalo.";
    }
  } else {
    const edited = await editDiscordMessage(webhookUrl, raidRow.discordSetupMessageId, payload);
    if (edited) {
      const previousSnapshot = (raidRow.discordSetupSnapshot as DiscordSetupSnapshotEntry[] | null) ?? [];
      const diff = diffSetupSnapshots(previousSnapshot, nextSnapshot);
      if (diff.added.length > 0 || diff.removed.length > 0) {
        // Fire-and-forget — editace zprávy hráče nepinguje, takže změna jde
        // novou zprávou; její id se neukládá, smysl je jen zapingovat.
        await postDiscordMessage(webhookUrl, {
          content: buildSetupChangeNoticeContent(diff),
          allowed_mentions: { parse: ["users"] },
        });
      }
      await db.update(raid).set({ discordSetupSnapshot: nextSnapshot }).where(eq(raid.id, raidId));
      ok = true;
    } else {
      ok = false;
      error = "Editace Discord zprávy selhala.";
    }
  }

  if (ok) {
    await logAudit({
      actorId: appUser.id,
      action: "setup_published_discord",
      targetType: "raid",
      targetId: raidId,
      description: `${raidRow.instance}: setup publikován na Discord.`,
    });
  }

  revalidateSetup(raidId);
  return ok ? { ok: true } : { ok: false, error };
}
