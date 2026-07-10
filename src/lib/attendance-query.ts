import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { attendanceRecord, assignment, raid } from "@/db/schema";
import { toPragueDateKey } from "./local-date";
import { isWithinPeriod, type PeriodFilter } from "./period-filter";
import type { AssignmentRole, AttendanceStatus } from "./attendance-stats";

export type AttendanceQueryRow = {
  userId: string;
  raidId: string;
  raidInstance: string;
  raidStartsAt: Date;
  status: AttendanceStatus;
  role: AssignmentRole;
};

/**
 * `attendance_record` řádky z DONE raidů, oříznuté na dané období — podle
 * pražského dne startu raidu (`toPragueDateKey`), ne UTC. Role (CONFIRMED/
 * BENCH) je LEFT JOIN na `(raid_id, user_id)` — může být `null`, pokud hráč
 * v mezičase ztratil přiřazení (nemělo by nastat, ale schéma to nevynucuje).
 * Sdíleno mezi guild žebříčkem (`/stats`) a profilem hráče (`/players/[userId]`).
 */
export async function getAttendanceRowsInPeriod(
  filter: PeriodFilter,
  opts: { userId?: string } = {},
): Promise<AttendanceQueryRow[]> {
  const conditions = [eq(raid.status, "DONE")];
  if (opts.userId) conditions.push(eq(attendanceRecord.userId, opts.userId));

  const rows = await db
    .select({
      userId: attendanceRecord.userId,
      raidId: attendanceRecord.raidId,
      status: attendanceRecord.status,
      raidInstance: raid.instance,
      raidStartsAt: raid.startsAt,
      role: assignment.status,
    })
    .from(attendanceRecord)
    .innerJoin(raid, eq(raid.id, attendanceRecord.raidId))
    .leftJoin(
      assignment,
      and(eq(assignment.raidId, attendanceRecord.raidId), eq(assignment.userId, attendanceRecord.userId)),
    )
    .where(and(...conditions));

  return rows
    .map((r) => ({ ...r, role: r.role ?? null }))
    .filter((r) => isWithinPeriod(toPragueDateKey(r.raidStartsAt), filter));
}
