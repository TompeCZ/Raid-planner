/**
 * Mapuje unique-violation z `character_one_main_per_user` na srozumitelnou
 * hlášku. Drizzle (postgres-js driver) balí skutečnou Postgres chybu do
 * DrizzleQueryError — reálný `code` je v `err.cause`, ne přímo na `err`.
 */
export function friendlyMainError(err: unknown): Error {
  const cause = (err as { cause?: unknown } | null | undefined)?.cause;
  const code =
    (cause as { code?: string } | null | undefined)?.code ??
    (err as { code?: string } | null | undefined)?.code;
  if (code === "23505") {
    return new Error("Nejdřív odškrtni stávající hlavní postavu, pak nastav novou.");
  }
  return new Error("Nastavení hlavní postavy se nepodařilo uložit.");
}
