import { describe, expect, it } from "vitest";
import { readRaidForm } from "./raid-validation";

/** Validní formulář jako základ — testy jednotlivá pole přepisují/mažou. */
function validForm(overrides: Record<string, string | null> = {}): FormData {
  const base: Record<string, string> = {
    instance: "Karazhan",
    startsAt: "2026-07-10T19:00",
    endsAt: "2026-07-10T23:00",
    signupMode: "ALL",
    capacity: "10",
    notes: "",
  };
  const formData = new FormData();
  for (const [key, value] of Object.entries({ ...base, ...overrides })) {
    if (value !== null) formData.set(key, value);
  }
  return formData;
}

describe("readRaidForm", () => {
  it("přečte validní formulář", () => {
    const values = readRaidForm(validForm({ notes: "  první raid  " }));
    expect(values.instance).toBe("Karazhan");
    expect(values.startsAt).toEqual(new Date("2026-07-10T19:00"));
    expect(values.endsAt).toEqual(new Date("2026-07-10T23:00"));
    expect(values.signupMode).toBe("ALL");
    expect(values.capacity).toBe(10);
    expect(values.notes).toBe("první raid");
  });

  it("prázdné notes normalizuje na null", () => {
    expect(readRaidForm(validForm()).notes).toBeNull();
    expect(readRaidForm(validForm({ notes: "   " })).notes).toBeNull();
  });

  it("odmítne chybějící nebo prázdnou instanci", () => {
    expect(() => readRaidForm(validForm({ instance: "" }))).toThrow("Instance je povinná.");
    expect(() => readRaidForm(validForm({ instance: "   " }))).toThrow("Instance je povinná.");
    expect(() => readRaidForm(validForm({ instance: null }))).toThrow("Instance je povinná.");
  });

  it("odmítne neparsovatelné datum", () => {
    expect(() => readRaidForm(validForm({ startsAt: "nesmysl" }))).toThrow("Neplatné začátek.");
    expect(() => readRaidForm(validForm({ endsAt: "" }))).toThrow("Neplatné konec.");
  });

  it("odmítne konec <= začátek (DB check raid_time_order)", () => {
    expect(() =>
      readRaidForm(validForm({ startsAt: "2026-07-10T19:00", endsAt: "2026-07-10T18:00" })),
    ).toThrow("Konec musí být po začátku.");
    expect(() =>
      readRaidForm(validForm({ startsAt: "2026-07-10T19:00", endsAt: "2026-07-10T19:00" })),
    ).toThrow("Konec musí být po začátku.");
  });

  it("odmítne neznámý signup mode", () => {
    expect(() => readRaidForm(validForm({ signupMode: "BOTH" }))).toThrow("Neplatný signup mode.");
    expect(() => readRaidForm(validForm({ signupMode: null }))).toThrow("Neplatný signup mode.");
  });

  it("přijme oba platné signup modes", () => {
    expect(readRaidForm(validForm({ signupMode: "ALL" })).signupMode).toBe("ALL");
    expect(readRaidForm(validForm({ signupMode: "SINGLE" })).signupMode).toBe("SINGLE");
  });

  it("odmítne kapacitu, která není kladné celé číslo", () => {
    for (const capacity of ["0", "-5", "2.5", "abc", ""]) {
      expect(() => readRaidForm(validForm({ capacity }))).toThrow(
        "Kapacita musí být kladné celé číslo.",
      );
    }
  });
});
