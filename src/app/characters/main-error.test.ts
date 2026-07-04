import { describe, expect, it } from "vitest";
import { friendlyMainError } from "./main-error";

/** Napodobí tvar DrizzleQueryError — reálný Postgres `code`/`message` je v `err.cause`, ne přímo na `err`. */
function fakeDrizzleError(code: string, message: string) {
  return { message: "Failed query: ...", cause: { code, message } };
}

describe("friendlyMainError (guard: druhá hlavní postava)", () => {
  it("unique-violation (23505) z character_one_main_per_user -> česká hláška", () => {
    const err = fakeDrizzleError(
      "23505",
      'duplicate key value violates unique constraint "character_one_main_per_user"',
    );
    expect(friendlyMainError(err).message).toBe(
      "Nejdřív odškrtni stávající hlavní postavu, pak nastav novou.",
    );
  });

  it("jiný kód -> obecná hláška, ne syrový SQL dump", () => {
    const err = fakeDrizzleError("23503", "foreign key violation");
    expect(friendlyMainError(err).message).toBe("Nastavení hlavní postavy se nepodařilo uložit.");
  });

  it("neznámý tvar chyby -> obecná hláška", () => {
    expect(friendlyMainError(new Error("cokoliv")).message).toBe(
      "Nastavení hlavní postavy se nepodařilo uložit.",
    );
  });
});
