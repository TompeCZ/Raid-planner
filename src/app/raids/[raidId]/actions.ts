"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { raid, signup, signupCharacter, character, signupStatus, user } from "@/db/schema";
import { canManageRaids, getCurrentAppUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { resolveDisplayName } from "@/lib/display-name";
import { getMainCharacterNamesByUserId } from "@/lib/main-character";
import { readRaidForm } from "../raid-validation";
import { canTransitionRaidStatus, isRaidEditable } from "../raid-status";

type RaidStatus = (typeof raid.status.enumValues)[number];

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
    }
  >();
  for (const row of rosterRows) {
    const entry = rosterBySignupId.get(row.signupId) ?? {
      signupId: row.signupId,
      status: row.status,
      userId: row.userId,
      displayName: row.displayName,
      characterNames: [],
    };
    if (row.characterName) entry.characterNames.push(row.characterName);
    rosterBySignupId.set(row.signupId, entry);
  }

  // Zobrazovací jméno hráče ostatním = jeho hlavní postava, jinak Discord displayName.
  const rosterEntries = Array.from(rosterBySignupId.values());
  const mainNames = await getMainCharacterNamesByUserId(rosterEntries.map((r) => r.userId));
  const roster = rosterEntries.map((r) => ({
    ...r,
    displayName: resolveDisplayName({ displayName: r.displayName }, mainNames.get(r.userId) ?? null),
  }));

  return {
    raid: raidRow,
    myCharacters,
    mySignup: mySignup ?? null,
    mySignupCharacterIds,
    roster,
  };
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

/** Ruční přechod stavu raidu (LOCKED/DONE/CANCELLED/znovu OPEN) — jen RAID_LEADER/ADMIN. */
export async function setRaidStatus(raidId: string, status: RaidStatus) {
  const appUser = await requireRaidLeader();
  const raidRow = await requireRaid(raidId);

  if (!canTransitionRaidStatus(raidRow.status, status)) {
    throw new Error(`Přechod ${raidRow.status} -> ${status} není povolen.`);
  }

  await db.update(raid).set({ status }).where(eq(raid.id, raidId));
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
