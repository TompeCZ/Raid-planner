"use server";

import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
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

export async function listOpenRaids() {
  await requireAppUser();
  return db
    .select()
    .from(raid)
    .where(eq(raid.status, "OPEN"))
    .orderBy(asc(raid.startsAt));
}

export async function createRaid(formData: FormData) {
  await requireRaidLeader();
  const values = readRaidForm(formData);

  await db.insert(raid).values({ ...values, status: "OPEN" });
  revalidatePath("/raids");
}
