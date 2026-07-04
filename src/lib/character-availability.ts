import "server-only";
import { and, eq, gt, inArray, lt, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { assignment, raid } from "@/db/schema";

export type BusyElsewhere = {
  characterId: string;
  raidId: string;
  raidInstance: string;
  startsAt: Date;
  endsAt: Date;
};

/**
 * Postavy z `characterIds`, které jsou CONFIRMED v JINÉM raidu, jehož čas se
 * překrývá s [startsAt, endsAt) tohoto raidu — proaktivní varování v setup
 * builderu, ať RL vidí dřív, než narazí na exclusion constraint (invariant 1)
 * teprve při pokusu o potvrzení. BENCH se nepočítá — stejná výjimka jako u
 * samotného constraintu: leader smí stejnou postavu tužkou hodit do dvou
 * raidů, jen ne potvrdit ve dvou najednou.
 */
export async function findCharactersConfirmedElsewhere(
  excludeRaidId: string,
  startsAt: Date,
  endsAt: Date,
  characterIds: string[],
): Promise<BusyElsewhere[]> {
  if (characterIds.length === 0) return [];

  return db
    .select({
      characterId: assignment.characterId,
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
        inArray(assignment.characterId, characterIds),
        lt(assignment.startsAt, endsAt),
        gt(assignment.endsAt, startsAt),
      ),
    );
}
