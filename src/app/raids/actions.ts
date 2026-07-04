"use server";

import { revalidatePath } from "next/cache";
import { asc, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { raid } from "@/db/schema";
import { canManageRaids, getCurrentAppUser } from "@/lib/auth";
import { readRaidForm } from "./raid-validation";

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

/** Aktivní raidy pro přehled — OPEN i LOCKED (uzamčené jsou pořád k nahlédnutí). */
export async function listActiveRaids() {
  await requireAppUser();
  return db
    .select()
    .from(raid)
    .where(inArray(raid.status, ["OPEN", "LOCKED"]))
    .orderBy(asc(raid.startsAt));
}

export async function createRaid(formData: FormData) {
  await requireRaidLeader();
  const values = readRaidForm(formData);

  await db.insert(raid).values({ ...values, status: "OPEN" });
  revalidatePath("/raids");
}
