"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { user } from "@/db/schema";
import { getCurrentAppUser } from "@/lib/auth";
import { getAttendanceRowsInPeriod } from "@/lib/attendance-query";
import { computeAttendanceStats, type AttendanceStats, type AttendanceStatus, type AssignmentRole } from "@/lib/attendance-stats";
import { resolveDisplayName } from "@/lib/display-name";
import { getMainCharacterNamesByUserId } from "@/lib/main-character";
import type { PeriodFilter } from "@/lib/period-filter";

async function requireAppUser() {
  const appUser = await getCurrentAppUser();
  if (!appUser) throw new Error("Nepřihlášeno.");
  return appUser;
}

export type PlayerRaidHistoryEntry = {
  raidId: string;
  raidInstance: string;
  raidStartsAt: Date;
  status: AttendanceStatus;
  role: AssignmentRole;
};

export type PlayerStatsData = {
  displayName: string;
  stats: AttendanceStats;
  history: PlayerRaidHistoryEntry[];
};

/** Profil hráče — veřejné pro každého přihlášeného člena, stejný filtr období jako guild žebříček. */
export async function getPlayerStats(userId: string, filter: PeriodFilter): Promise<PlayerStatsData> {
  await requireAppUser();

  const [userRow] = await db
    .select({ id: user.id, displayName: user.displayName })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!userRow) throw new Error("Hráč nenalezen.");

  const rows = await getAttendanceRowsInPeriod(filter, { userId });
  const mainName = (await getMainCharacterNamesByUserId([userId])).get(userId) ?? null;

  const history = rows
    .map((r) => ({
      raidId: r.raidId,
      raidInstance: r.raidInstance,
      raidStartsAt: r.raidStartsAt,
      status: r.status,
      role: r.role,
    }))
    .sort((a, b) => b.raidStartsAt.getTime() - a.raidStartsAt.getTime());

  return {
    displayName: resolveDisplayName({ displayName: userRow.displayName }, mainName),
    stats: computeAttendanceStats(rows.map((r) => ({ status: r.status, role: r.role }))),
    history,
  };
}
