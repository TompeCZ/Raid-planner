import { describe, expect, it } from "vitest";
import { deriveSeededAttendance, type SeedAbsenceRange } from "./attendance-seed";

describe("deriveSeededAttendance", () => {
  it("bez absence dostane hráč PRESENT", () => {
    const result = deriveSeededAttendance(["u1"], new Map(), "2026-07-10");
    expect(result).toEqual([{ userId: "u1", status: "PRESENT", note: null }]);
  });

  it("hráč s absencí pokrývající den raidu dostane ABSENCE + note", () => {
    const absencesByUser = new Map<string, SeedAbsenceRange[]>([
      ["u1", [{ fromDate: "2026-07-08", toDate: "2026-07-12", note: "Dovolená" }]],
    ]);
    const result = deriveSeededAttendance(["u1"], absencesByUser, "2026-07-10");
    expect(result).toEqual([{ userId: "u1", status: "ABSENCE", note: "Dovolená" }]);
  });

  it("hraniční dny (from_date a to_date) se počítají jako aktivní absence", () => {
    const absencesByUser = new Map<string, SeedAbsenceRange[]>([
      ["u1", [{ fromDate: "2026-07-10", toDate: "2026-07-10", note: null }]],
    ]);
    const result = deriveSeededAttendance(["u1"], absencesByUser, "2026-07-10");
    expect(result[0].status).toBe("ABSENCE");
  });

  it("absence mimo den raidu hráče neovlivní", () => {
    const absencesByUser = new Map<string, SeedAbsenceRange[]>([
      ["u1", [{ fromDate: "2026-06-01", toDate: "2026-06-30", note: "Dovolená" }]],
    ]);
    const result = deriveSeededAttendance(["u1"], absencesByUser, "2026-07-10");
    expect(result).toEqual([{ userId: "u1", status: "PRESENT", note: null }]);
  });

  it("zachová pořadí a řeší víc hráčů nezávisle", () => {
    const absencesByUser = new Map<string, SeedAbsenceRange[]>([
      ["u2", [{ fromDate: "2026-07-01", toDate: "2026-07-15", note: "Nemoc" }]],
    ]);
    const result = deriveSeededAttendance(["u1", "u2", "u3"], absencesByUser, "2026-07-10");
    expect(result).toEqual([
      { userId: "u1", status: "PRESENT", note: null },
      { userId: "u2", status: "ABSENCE", note: "Nemoc" },
      { userId: "u3", status: "PRESENT", note: null },
    ]);
  });
});
