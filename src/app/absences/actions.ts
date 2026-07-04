"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { absence, raid, raidTemplate, character, user } from "@/db/schema";
import { getCurrentAppUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { findConflictedAssignments } from "@/lib/absence-conflicts";
import { sendDiscordWebhook } from "@/lib/discord-webhook";
import { readAbsenceForm } from "./absence-validation";

async function requireAppUser() {
  const appUser = await getCurrentAppUser();
  if (!appUser) throw new Error("Nepřihlášeno.");
  return appUser;
}

/** Vrátí absenci, jen pokud patří přihlášenému uživateli a není smazaná. */
async function requireOwnAbsence(absenceId: string, appUserId: string) {
  const [row] = await db
    .select()
    .from(absence)
    .where(
      and(eq(absence.id, absenceId), eq(absence.userId, appUserId), isNull(absence.deletedAt)),
    )
    .limit(1);
  if (!row) throw new Error("Absence nenalezena nebo nepatří tobě.");
  return row;
}

export async function listMyAbsences() {
  const appUser = await requireAppUser();
  return db
    .select()
    .from(absence)
    .where(and(eq(absence.userId, appUser.id), isNull(absence.deletedAt)))
    .orderBy(desc(absence.fromDate));
}

/**
 * Reverse-flow detekce absence-konfliktu (jádro téhle vertikály): po zápisu
 * absence dohledá, které CONFIRMED assignmenty hráče se PRÁVĚ nově dostaly do
 * konfliktu (nebyly konfliktní před zápisem), a na ty pošle Discord ping —
 * jinak by při každé další editaci libovolné absence RL dostával duplicitní
 * upozornění na konflikty, o kterých už ví.
 */
async function notifyNewAbsenceConflicts(userId: string, previouslyConflictedIds: Set<string>) {
  const after = await findConflictedAssignments({ userId });
  const newConflicts = after.filter((a) => !previouslyConflictedIds.has(a.assignmentId));
  if (newConflicts.length === 0) return;

  const [userRow] = await db
    .select({ displayName: user.displayName })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  for (const conflict of newConflicts) {
    const [raidRow] = await db.select().from(raid).where(eq(raid.id, conflict.raidId)).limit(1);
    if (!raidRow) continue;

    let webhookUrl = raidRow.discordWebhookOverride;
    if (!webhookUrl && raidRow.templateId) {
      const [template] = await db
        .select({ url: raidTemplate.discordWebhookUrl })
        .from(raidTemplate)
        .where(eq(raidTemplate.id, raidRow.templateId))
        .limit(1);
      webhookUrl = template?.url ?? null;
    }

    const [characterRow] = await db
      .select({ name: character.name })
      .from(character)
      .where(eq(character.id, conflict.characterId))
      .limit(1);

    const description = `Absence hráče ${userRow?.displayName ?? userId} koliduje s potvrzenou postavou ${characterRow?.name ?? conflict.characterId} v raidu ${raidRow.instance} (${raidRow.startsAt.toISOString()}).`;

    await sendDiscordWebhook(
      webhookUrl,
      `⚠️ **Absence-konflikt** — ${userRow?.displayName ?? "Hráč"} nahlásil absenci, ale má potvrzenou postavu **${characterRow?.name ?? "?"}** v raidu **${raidRow.instance}** (${raidRow.startsAt.toLocaleString("cs-CZ")}). Zkontroluj setup.`,
    );

    await logAudit({
      actorId: userId,
      action: "absence_conflict_detected",
      targetType: "assignment",
      targetId: conflict.assignmentId,
      description,
    });
  }
}

export async function createAbsence(formData: FormData) {
  const appUser = await requireAppUser();
  const values = readAbsenceForm(formData);

  const before = await findConflictedAssignments({ userId: appUser.id });
  const beforeIds = new Set(before.map((a) => a.assignmentId));

  await db.insert(absence).values({ ...values, userId: appUser.id });

  await notifyNewAbsenceConflicts(appUser.id, beforeIds);
  revalidatePath("/absences");
}

export async function updateAbsence(absenceId: string, formData: FormData) {
  const appUser = await requireAppUser();
  await requireOwnAbsence(absenceId, appUser.id);
  const values = readAbsenceForm(formData);

  const before = await findConflictedAssignments({ userId: appUser.id });
  const beforeIds = new Set(before.map((a) => a.assignmentId));

  await db.update(absence).set(values).where(eq(absence.id, absenceId));

  await notifyNewAbsenceConflicts(appUser.id, beforeIds);
  revalidatePath("/absences");
}

export async function cancelAbsence(absenceId: string) {
  const appUser = await requireAppUser();
  await requireOwnAbsence(absenceId, appUser.id);

  await db.update(absence).set({ deletedAt: new Date() }).where(eq(absence.id, absenceId));
  revalidatePath("/absences");
}
