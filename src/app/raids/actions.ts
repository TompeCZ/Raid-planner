"use server";

import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { raid } from "@/db/schema";
import { getCurrentAppUser } from "@/lib/auth";
import { readRaidForm } from "./raid-validation";

async function requireAppUser() {
  const appUser = await getCurrentAppUser();
  if (!appUser) throw new Error("Nepřihlášeno.");
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
  // VARIANTA B: create raidu smí kdokoli přihlášený.
  // TODO: omezit na RAID_LEADER/ADMIN
  await requireAppUser();
  const values = readRaidForm(formData);

  await db.insert(raid).values({ ...values, status: "OPEN" });
  revalidatePath("/raids");
}
