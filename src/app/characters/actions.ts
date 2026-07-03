"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { character, faction, charRole } from "@/db/schema";
import { getCurrentAppUser } from "@/lib/auth";

const FACTIONS = faction.enumValues;
const ROLES = charRole.enumValues;

async function requireAppUser() {
  const appUser = await getCurrentAppUser();
  if (!appUser) throw new Error("Nepřihlášeno.");
  return appUser;
}

function readCharacterForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const realm = String(formData.get("realm") ?? "").trim();
  const factionValue = String(formData.get("faction") ?? "");
  const classValue = String(formData.get("class") ?? "").trim();
  const roleValue = String(formData.get("role") ?? "");
  const externalUrl = String(formData.get("externalUrl") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const isRaidReady = formData.get("isRaidReady") === "on";

  if (!name) throw new Error("Jméno postavy je povinné.");
  if (!realm) throw new Error("Realm je povinný.");
  if (!classValue) throw new Error("Class je povinná.");
  if (!FACTIONS.includes(factionValue as (typeof FACTIONS)[number])) {
    throw new Error("Neplatná faction.");
  }
  if (!ROLES.includes(roleValue as (typeof ROLES)[number])) {
    throw new Error("Neplatná role.");
  }

  return {
    name,
    realm,
    faction: factionValue as (typeof FACTIONS)[number],
    class: classValue,
    role: roleValue as (typeof ROLES)[number],
    isRaidReady,
    externalUrl: externalUrl || null,
    note: note || null,
  };
}

export async function listMyCharacters() {
  const appUser = await requireAppUser();
  return db
    .select()
    .from(character)
    .where(and(eq(character.userId, appUser.id), isNull(character.deletedAt)))
    .orderBy(character.name);
}

export async function createCharacter(formData: FormData) {
  const appUser = await requireAppUser();
  const values = readCharacterForm(formData);

  await db.insert(character).values({ ...values, userId: appUser.id });
  revalidatePath("/characters");
}

/** Vrátí postavu, jen pokud patří přihlášenému uživateli a není smazaná. */
async function requireOwnCharacter(characterId: string, appUserId: string) {
  const [row] = await db
    .select()
    .from(character)
    .where(
      and(
        eq(character.id, characterId),
        eq(character.userId, appUserId),
        isNull(character.deletedAt),
      ),
    )
    .limit(1);

  if (!row) throw new Error("Postava nenalezena nebo nepatří tobě.");
  return row;
}

export async function updateCharacter(characterId: string, formData: FormData) {
  const appUser = await requireAppUser();
  await requireOwnCharacter(characterId, appUser.id);
  const values = readCharacterForm(formData);

  await db.update(character).set(values).where(eq(character.id, characterId));
  revalidatePath("/characters");
}

export async function softDeleteCharacter(characterId: string) {
  const appUser = await requireAppUser();
  await requireOwnCharacter(characterId, appUser.id);

  await db
    .update(character)
    .set({ deletedAt: new Date() })
    .where(eq(character.id, characterId));
  revalidatePath("/characters");
}
