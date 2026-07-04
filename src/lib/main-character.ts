import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { character } from "@/db/schema";

export type MainCharacter = { name: string; class: string };

/** Hlavní (nesmazané) postavy pro danou množinu hráčů, klíčováno userId. */
export async function getMainCharactersByUserId(
  userIds: string[],
): Promise<Map<string, MainCharacter>> {
  if (userIds.length === 0) return new Map();

  const rows = await db
    .select({ userId: character.userId, name: character.name, class: character.class })
    .from(character)
    .where(
      and(
        inArray(character.userId, userIds),
        eq(character.isMain, true),
        isNull(character.deletedAt),
      ),
    );

  return new Map(rows.map((r) => [r.userId, { name: r.name, class: r.class }]));
}

/** Jen jména hlavních postav — zjednodušená projekce nad getMainCharactersByUserId. */
export async function getMainCharacterNamesByUserId(
  userIds: string[],
): Promise<Map<string, string>> {
  const main = await getMainCharactersByUserId(userIds);
  return new Map([...main].map(([userId, c]) => [userId, c.name]));
}
