import "server-only";
import { and, eq, gt, inArray, lt, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { assignment, raid } from "@/db/schema";

export type BusyElsewhere = {
  userId: string;
  raidId: string;
  raidInstance: string;
  startsAt: Date;
  endsAt: Date;
};

/**
 * Hráči z `userIds`, kteří mají CONFIRMED postavu v JINÉM raidu, jehož čas se
 * překrývá s [startsAt, endsAt) tohoto raidu — proaktivní varování v setup
 * builderu, ať RL vidí dřív, než narazí na exclusion constraint (invariant 1)
 * teprve při pokusu o potvrzení.
 *
 * Klíčováno na hráče, ne na konkrétní postavu: za jednoho hráče nejde jít
 * dvěma postavami současně, takže i kdyby byla „busy" jen jeho postava A,
 * všechny jeho ostatní postavy B/C jsou stejně nedostupné — nikdo jiný z jeho
 * účtu se do téhle skupiny nedostane.
 *
 * BENCH se nepočítá — stejná výjimka jako u samotného constraintu: leader smí
 * stejného hráče tužkou hodit do dvou raidů, jen ho nemůže potvrdit ve dvou
 * najednou.
 */
export async function findUsersConfirmedElsewhere(
  excludeRaidId: string,
  startsAt: Date,
  endsAt: Date,
  userIds: string[],
): Promise<BusyElsewhere[]> {
  if (userIds.length === 0) return [];

  return db
    .select({
      userId: assignment.userId,
      raidId: assignment.raidId,
      raidInstance: raid.instance,
      startsAt: assignment.startsAt,
      endsAt: assignment.endsAt,
    })
    .from(assignment)
    .innerJoin(raid, eq(raid.id, assignment.raidId))
    .where(
      and(
        ne(assignment.raidId, excludeRaidId),
        eq(assignment.status, "CONFIRMED"),
        inArray(assignment.userId, userIds),
        lt(assignment.startsAt, endsAt),
        gt(assignment.endsAt, startsAt),
      ),
    );
}
