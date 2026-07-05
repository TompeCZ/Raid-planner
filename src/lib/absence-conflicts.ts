import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { absence, assignment, raid } from "@/db/schema";

export type ConflictedAssignment = {
  assignmentId: string;
  raidId: string;
  characterId: string;
  userId: string;
};

/**
 * CONFIRMED assignmenty, jejichž majitel má aktivní absenci pokrývající den raidu.
 *
 * Rozhodnutí: konflikt se NEUKLÁDÁ do sloupce/flagu, ale počítá se odvozeně při
 * čtení — stejný dotaz použije setup builder (per raid), dashboard (přes víc
 * raidů) i notifikace po zápisu absence. Stejná logika jako DB trigger
 * `assignment_block_on_absence` (DATE(starts_at at time zone UTC) mezi
 * from_date/to_date), ale trigger hlídá jen forward směr (insert/update
 * assignmentu); tahle funkce pokrývá reverse směr — absence vytvořená/rozšířená
 * AŽ PO tom, co byl assignment potvrzený. Odvozený dotaz je proti uloženému
 * flagu odolný vůči zastarání (zkrácení/zrušení absence nebo posun raidu se
 * projeví okamžitě, bez nutnosti flag ručně přepočítávat).
 */
export async function findConflictedAssignments(
  filter: { raidId?: string; raidIds?: string[]; userId?: string } = {},
): Promise<ConflictedAssignment[]> {
  if (filter.raidIds && filter.raidIds.length === 0) return [];

  const conditions = [
    eq(assignment.status, "CONFIRMED"),
    isNull(absence.deletedAt),
    sql`(${raid.startsAt} AT TIME ZONE 'UTC')::date BETWEEN ${absence.fromDate} AND ${absence.toDate}`,
  ];
  if (filter.raidId) conditions.push(eq(assignment.raidId, filter.raidId));
  if (filter.raidIds) conditions.push(inArray(assignment.raidId, filter.raidIds));
  if (filter.userId) conditions.push(eq(assignment.userId, filter.userId));

  return db
    .selectDistinct({
      assignmentId: assignment.id,
      raidId: assignment.raidId,
      characterId: assignment.characterId,
      userId: assignment.userId,
    })
    .from(assignment)
    .innerJoin(raid, eq(raid.id, assignment.raidId))
    .innerJoin(absence, eq(absence.userId, assignment.userId))
    .where(and(...conditions));
}

/** ID raidů z `raidIds`, které mají alespoň jeden konfliktní CONFIRMED assignment. */
export async function findConflictedRaidIds(raidIds: string[]): Promise<Set<string>> {
  const rows = await findConflictedAssignments({ raidIds });
  return new Set(rows.map((r) => r.raidId));
}

/**
 * Hráči z `userIds`, kteří mají aktivní Absenci pokrývající termín raidu — bez
 * ohledu na to, jestli v raidu vůbec mají assignment. Na rozdíl od
 * `findConflictedAssignments` (jen CONFIRMED assignmenty, reverse-flow konflikt)
 * tohle pokrývá i hráče, co jsou teprve v signup poolu — setup builder podle
 * toho vyřazuje jejich postavy ze sekce „Přihlášené" do sekce „Absence", ať
 * leader vidí absenci dřív, než se ji pokusí (marně) přiřadit. Stejná podmínka
 * data jako trigger `assignment_block_on_absence` (DATE(starts_at AT TIME ZONE 'UTC')).
 */
export async function findAbsentUserIdsForRaid(
  raidStartsAt: Date,
  userIds: string[],
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();

  const rows = await db
    .select({ userId: absence.userId })
    .from(absence)
    .where(
      and(
        inArray(absence.userId, userIds),
        isNull(absence.deletedAt),
        sql`(${raidStartsAt}::timestamptz AT TIME ZONE 'UTC')::date BETWEEN ${absence.fromDate} AND ${absence.toDate}`,
      ),
    );

  return new Set(rows.map((r) => r.userId));
}
