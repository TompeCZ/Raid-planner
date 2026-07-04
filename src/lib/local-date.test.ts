import { describe, expect, it } from "vitest";
import { pragueDateKeyPlusDays, toPragueDateKey } from "./local-date";

describe("toPragueDateKey", () => {
  it("pozdní večerní UTC čas přes půlnoc (léto, CEST = UTC+2) spadne na SPRÁVNÝ (pozdější) pražský den", () => {
    // 2026-07-05T22:30Z = 2026-07-06T00:30 Europe/Prague (CEST +2).
    // Naivní UTC datum by řeklo 07-05 — to je přesně chyba, které se chceme vyhnout.
    expect(toPragueDateKey(new Date("2026-07-05T22:30:00Z"))).toBe("2026-07-06");
  });

  it("čas těsně před půlnocí Prahou zůstává na stejném dni jako UTC", () => {
    // 2026-07-05T21:00Z = 2026-07-05T23:00 Europe/Prague (CEST +2).
    expect(toPragueDateKey(new Date("2026-07-05T21:00:00Z"))).toBe("2026-07-05");
  });

  it("stejná past i v zimě (CET = UTC+1)", () => {
    // 2026-01-05T23:30Z = 2026-01-06T00:30 Europe/Prague (CET +1).
    expect(toPragueDateKey(new Date("2026-01-05T23:30:00Z"))).toBe("2026-01-06");
  });

  it("běžné poledne je stejný den v UTC i Praze", () => {
    expect(toPragueDateKey(new Date("2026-07-10T12:00:00Z"))).toBe("2026-07-10");
  });
});

describe("pragueDateKeyPlusDays", () => {
  it("+0 dní vrátí stejný den jako toPragueDateKey", () => {
    const d = new Date("2026-07-05T22:30:00Z");
    expect(pragueDateKeyPlusDays(d, 0)).toBe(toPragueDateKey(d));
  });

  it("přičítání dní respektuje pražský den, ne UTC", () => {
    // Základ je večerní UTC čas, který už je v Praze +1 den (07-06).
    const base = new Date("2026-07-05T22:30:00Z");
    expect(pragueDateKeyPlusDays(base, 1)).toBe("2026-07-07");
    expect(pragueDateKeyPlusDays(base, 6)).toBe("2026-07-12");
  });

  it("přechod přes konec měsíce funguje správně", () => {
    const base = new Date("2026-07-30T10:00:00Z");
    expect(pragueDateKeyPlusDays(base, 3)).toBe("2026-08-02");
  });

  it("přechod přes DST (konec října) nezpůsobí posun o den", () => {
    // 2026-10-25 je poslední neděle v říjnu (konec CEST); o týden dál je
    // Praha už v CET (+1). Sedm po sobě jdoucích dní musí dát sedm různých,
    // sekvenčních klíčů bez duplicity nebo přeskočení.
    const base = new Date("2026-10-22T12:00:00Z");
    const keys = Array.from({ length: 7 }, (_, i) => pragueDateKeyPlusDays(base, i));
    expect(keys).toEqual([
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
    ]);
  });
});
