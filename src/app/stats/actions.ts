"use server";

import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { user } from "@/db/schema";
import { getCurrentAppUser } from "@/lib/auth";
import { getAttendanceRowsInPeriod } from "@/lib/attendance-query";
import { computeAttendanceStats, type AttendanceStats } from "@/lib/attendance-stats";
import { resolveDisplayName } from "@/lib/display-name";
import { getMainCharacterNamesByUserId } from "@/lib/main-character";
import type { PeriodFilter } from "@/lib/period-filter";

async function requireAppUser() {
  const appUser = await getCurrentAppUser();
  if (!appUser) throw new Error("Nepřihlášeno.");
  return appUser;
}

export type LeaderboardRow = {
  userId: string;
  displayName: string;
  raidCount: number;
  stats: AttendanceStats;
};

/**
 * Guild žebříček — veřejné pro každého přihlášeného člena (žádné RL omezení,
 * to přijde až s Notes vertikálou). Populace = kdokoli s aspoň jedním
 * `attendance_record` v daném období (jen DONE raidy mají záznamy).
 */
export async function getGuildLeaderboard(filter: PeriodFilter): Promise<LeaderboardRow[]> {
  await requireAppUser();

  const rows = await getAttendanceRowsInPeriod(filter);
  if (rows.length === 0) return [];

  const byUser = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byUser.get(row.userId) ?? [];
    list.push(row);
    byUser.set(row.userId, list);
  }

  const userIds = [...byUser.keys()];
  const userRows = await db
    .select({ id: user.id, displayName: user.displayName })
    .from(user)
    .where(inArray(user.id, userIds));
  const displayNameById = new Map(userRows.map((u) => [u.id, u.displayName]));
  const mainNames = await getMainCharacterNamesByUserId(userIds);

  return userIds.map((userId) => {
    const entries = byUser.get(userId)!;
    return {
      userId,
      displayName: resolveDisplayName(
        { displayName: displayNameById.get(userId) ?? "?" },
        mainNames.get(userId) ?? null,
      ),
      raidCount: new Set(entries.map((e) => e.raidId)).size,
      stats: computeAttendanceStats(entries.map((e) => ({ status: e.status, role: e.role }))),
    };
  });
}
