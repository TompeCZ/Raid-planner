import { describe, expect, it } from "vitest";
import { resolveDisplayName } from "./display-name";

describe("resolveDisplayName", () => {
  it("vrátí jméno hlavní postavy, pokud existuje", () => {
    expect(resolveDisplayName({ displayName: "tommy_cz87" }, "Legolas")).toBe("Legolas");
  });

  it("bez hlavní postavy spadne na Discord displayName", () => {
    expect(resolveDisplayName({ displayName: "tommy_cz87" }, null)).toBe("tommy_cz87");
  });

  it("smazaná hlavní postava se ke funkci nedostane (volající ji vyfiltruje) → fallback", () => {
    // getMainCharacterNamesByUserId filtruje `deletedAt IS NULL` už v dotazu,
    // takže smazaná hlavní postava se sem nikdy nedostane jako non-null hodnota —
    // volající pro ni předá null, stejně jako kdyby žádnou hlavní neměl.
    const mainCharacterNameAfterDeletion = null;
    expect(resolveDisplayName({ displayName: "tommy_cz87" }, mainCharacterNameAfterDeletion)).toBe(
      "tommy_cz87",
    );
  });
});
