"use server";

import { revalidatePath } from "next/cache";
import { and, asc, gte, inArray, or } from "drizzle-orm";
import { db } from "@/db/client";
import { raid } from "@/db/schema";
import { canManageRaids, getCurrentAppUser } from "@/lib/auth";
import { toPragueDateKey } from "@/lib/local-date";
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

/**
 * Aktivní raidy pro přehled — OPEN i LOCKED bez ohledu na datum (uzamčené jsou
 * pořád k nahlédnutí), plus DONE/CANCELLED, ale jen od dneška (Europe/Prague)
 * dál. Důvod: DONE/CANCELLED raid jinak ze seznamu úplně zmizí, takže při
 * zakládání nového raidu není vidět, že už existuje jiný raid ve stejném
 * termínu — přesně tahle situace v testování reálně nastala (dva raidy
 * "SSC" ve stejný čas, jeden už DONE, zešedlé postavy v setupu druhého
 * vypadaly jako bug). Staré historické DONE/CANCELLED raidy naopak seznam
 * zavalovat nemají, proto ne úplně bez omezení.
 */
export async function listActiveRaids() {
  await requireAppUser();

  const todayKey = toPragueDateKey(new Date());
  const [y, m, d] = todayKey.split("-").map(Number);
  // O den širší okno v UTC (bezpečné vůči DST) — přesné zařazení řeší až
  // toPragueDateKey filtr níže, stejný vzor jako getDashboardRaids.
  const recentWindowStart = new Date(Date.UTC(y, m - 1, d - 1, 0, 0, 0));

  const rows = await db
    .select()
    .from(raid)
    .where(
      or(
        inArray(raid.status, ["OPEN", "LOCKED"]),
        and(inArray(raid.status, ["DONE", "CANCELLED"]), gte(raid.startsAt, recentWindowStart)),
      ),
    )
    .orderBy(asc(raid.startsAt));

  return rows.filter((r) => {
    if (r.status === "OPEN" || r.status === "LOCKED") return true;
    return toPragueDateKey(r.startsAt) >= todayKey;
  });
}

export async function createRaid(formData: FormData) {
  await requireRaidLeader();
  const values = readRaidForm(formData);

  await db.insert(raid).values({ ...values, status: "OPEN" });
  revalidatePath("/raids");
}
