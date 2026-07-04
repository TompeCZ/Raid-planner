"use server";

import { and, eq, gte, lt, notInArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { raid, user } from "@/db/schema";
import { getCurrentAppUser } from "@/lib/auth";
import { pragueDateKeyPlusDays, toPragueDateKey } from "@/lib/local-date";

async function requireAppUser() {
  const appUser = await getCurrentAppUser();
  if (!appUser) throw new Error("Nepřihlášeno.");
  return appUser;
}

export type DashboardDay = {
  dateKey: string;
  raids: (typeof raid.$inferSelect)[];
};

/**
 * Raidy pro dashboard: 7 po sobě jdoucích pražských dní od dneška, bucketované
 * podle LOKÁLNÍHO (Europe/Prague) dne startu — ne podle UTC. DRAFT/CANCELLED
 * se nezobrazují (dashboard = co je reálně naplánované).
 */
export async function getDashboardRaids(): Promise<DashboardDay[]> {
  await requireAppUser();

  const now = new Date();
  const todayKey = toPragueDateKey(now);
  const [y, m, d] = todayKey.split("-").map(Number);
  // Okno v UTC o den širší na obě strany, ať se nic neztratí na hraně DST —
  // přesné zařazení do dne řeší až toPragueDateKey níže.
  const windowStart = new Date(Date.UTC(y, m - 1, d - 1, 0, 0, 0));
  const windowEnd = new Date(Date.UTC(y, m - 1, d + 8, 0, 0, 0));

  const rows = await db
    .select()
    .from(raid)
    .where(
      and(
        gte(raid.startsAt, windowStart),
        lt(raid.startsAt, windowEnd),
        notInArray(raid.status, ["DRAFT", "CANCELLED"]),
      ),
    )
    .orderBy(raid.startsAt);

  const dayKeys = Array.from({ length: 7 }, (_, i) => pragueDateKeyPlusDays(now, i));
  const raidsByDay = new Map<string, (typeof raid.$inferSelect)[]>();
  for (const key of dayKeys) raidsByDay.set(key, []);
  for (const row of rows) {
    const key = toPragueDateKey(row.startsAt);
    raidsByDay.get(key)?.push(row);
  }

  return dayKeys.map((dateKey) => ({ dateKey, raids: raidsByDay.get(dateKey) ?? [] }));
}

/** Aktuální iCal odběrový token přihlášeného hráče (nebo null, pokud si ho ještě nevygeneroval). */
export async function getMyCalendarToken(): Promise<string | null> {
  const appUser = await requireAppUser();
  const [row] = await db
    .select({ calendarToken: user.calendarToken })
    .from(user)
    .where(eq(user.id, appUser.id))
    .limit(1);
  return row?.calendarToken ?? null;
}

/**
 * Vygeneruje (nebo přegeneruje) iCal odběrový token. Přegenerování nastaví
 * nový uuid, čímž okamžitě zneplatní starou odběrovou URL.
 */
export async function generateCalendarToken(): Promise<string> {
  const appUser = await requireAppUser();
  const [row] = await db
    .update(user)
    .set({ calendarToken: sql`gen_random_uuid()` })
    .where(eq(user.id, appUser.id))
    .returning({ calendarToken: user.calendarToken });

  if (!row?.calendarToken) throw new Error("Token se nepodařilo vygenerovat.");
  return row.calendarToken;
}
