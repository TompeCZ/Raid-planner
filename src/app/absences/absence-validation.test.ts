import { describe, expect, it } from "vitest";
import { readAbsenceForm } from "./absence-validation";

function validForm(overrides: Record<string, string | null> = {}): FormData {
  const base: Record<string, string> = {
    fromDate: "2026-07-10",
    toDate: "2026-07-12",
    note: "",
  };
  const formData = new FormData();
  for (const [key, value] of Object.entries({ ...base, ...overrides })) {
    if (value !== null) formData.set(key, value);
  }
  return formData;
}

describe("readAbsenceForm", () => {
  it("přečte validní formulář", () => {
    const values = readAbsenceForm(validForm({ note: "  dovolená  " }));
    expect(values.fromDate).toBe("2026-07-10");
    expect(values.toDate).toBe("2026-07-12");
    expect(values.note).toBe("dovolená");
  });

  it("prázdné notes normalizuje na null", () => {
    expect(readAbsenceForm(validForm()).note).toBeNull();
  });

  it("odmítne chybějící data", () => {
    expect(() => readAbsenceForm(validForm({ fromDate: null }))).toThrow("Od kdy je povinné.");
    expect(() => readAbsenceForm(validForm({ toDate: null }))).toThrow("Do kdy je povinné.");
  });

  it("odmítne konec před začátkem (DB check absence_date_order)", () => {
    expect(() =>
      readAbsenceForm(validForm({ fromDate: "2026-07-12", toDate: "2026-07-10" })),
    ).toThrow("Konec musí být stejný den nebo po začátku.");
  });

  it("přijme jednodenní absenci (od == do)", () => {
    const values = readAbsenceForm(validForm({ fromDate: "2026-07-10", toDate: "2026-07-10" }));
    expect(values.fromDate).toBe(values.toDate);
  });
});
