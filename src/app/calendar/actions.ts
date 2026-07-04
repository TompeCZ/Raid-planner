"use server";

import { and, eq, gte, isNull, lte, notInArray } from "drizzle-orm";
import { db } from "@/db/client";
import { absence, raid, user } from "@/db/schema";
import { getCurrentAppUser } from "@/lib/auth";
import { resolveDisplayName } from "@/lib/display-name";
import { toPragueDateKey } from "@/lib/local-date";
import { getMainCharactersByUserId } from "@/lib/main-character";

async function requireAppUser() {
  const appUser = await getCurrentAppUser();
  if (!appUser) throw new Error("Nepřihlášeno.");
  return appUser;
}

export type CalendarRaid = { id: string; instance: string; startsAt: Date; endsAt: Date };

export type CalendarAbsence = {
  id: string;
  fromDate: string;
  toDate: string;
  displayName: string;
  characterClass: string | null;
};

export type CalendarMonthData = {
  raidsByDay: Record<string, CalendarRaid[]>;
  absences: CalendarAbsence[];
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Data pro měsíční mřížku kalendáře. `year`/`month` jsou lidské (month 1–12).
 * Raidy se bucketují podle LOKÁLNÍHO (Europe/Prague) dne startu (viz
 * src/lib/local-date.ts), absence jsou čisté DATE rozsahy bez TZ řešení.
 */
export async function getCalendarMonth(year: number, month: number): Promise<CalendarMonthData> {
  await requireAppUser();

  const monthStartUtc = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const monthEndUtc = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  // Okno o den širší na obě strany kvůli DST/lokálnímu dni — přesné zařazení
  // a oříznutí na zobrazený měsíc řeší toPragueDateKey/monthKeyPrefix níže.
  const windowStart = new Date(monthStartUtc);
  windowStart.setUTCDate(windowStart.getUTCDate() - 1);
  const windowEnd = new Date(monthEndUtc);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 1);

  const raidRows = await db
    .select({ id: raid.id, instance: raid.instance, startsAt: raid.startsAt, endsAt: raid.endsAt })
    .from(raid)
    .where(
      and(
        gte(raid.startsAt, windowStart),
        lte(raid.startsAt, windowEnd),
        notInArray(raid.status, ["DRAFT", "CANCELLED"]),
      ),
    )
    .orderBy(raid.startsAt);

  const monthKeyPrefix = `${year}-${pad2(month)}`;
  const raidsByDay: Record<string, CalendarRaid[]> = {};
  for (const r of raidRows) {
    const key = toPragueDateKey(r.startsAt);
    if (!key.startsWith(monthKeyPrefix)) continue;
    (raidsByDay[key] ??= []).push(r);
  }

  const monthStartKey = `${monthKeyPrefix}-01`;
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthEndKey = `${monthKeyPrefix}-${pad2(lastDayOfMonth)}`;

  const absenceRows = await db
    .select({
      id: absence.id,
      userId: absence.userId,
      fromDate: absence.fromDate,
      toDate: absence.toDate,
      displayName: user.displayName,
    })
    .from(absence)
    .innerJoin(user, eq(user.id, absence.userId))
    .where(
      and(
        isNull(absence.deletedAt),
        lte(absence.fromDate, monthEndKey),
        gte(absence.toDate, monthStartKey),
      ),
    );

  const mainByUser = await getMainCharactersByUserId([
    ...new Set(absenceRows.map((a) => a.userId)),
  ]);

  const absences: CalendarAbsence[] = absenceRows.map((a) => {
    const main = mainByUser.get(a.userId);
    return {
      id: a.id,
      fromDate: a.fromDate,
      toDate: a.toDate,
      displayName: resolveDisplayName({ displayName: a.displayName }, main?.name ?? null),
      characterClass: main?.class ?? null,
    };
  });

  return { raidsByDay, absences };
}
