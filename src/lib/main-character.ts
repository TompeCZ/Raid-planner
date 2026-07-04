import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { character } from "@/db/schema";

/** Jména hlavních (nesmazaných) postav pro danou množinu hráčů, klíčováno userId. */
export async function getMainCharacterNamesByUserId(
  userIds: string[],
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();

  const rows = await db
    .select({ userId: character.userId, name: character.name })
    .from(character)
    .where(
      and(
        inArray(character.userId, userIds),
        eq(character.isMain, true),
        isNull(character.deletedAt),
      ),
    );

  return new Map(rows.map((r) => [r.userId, r.name]));
}
