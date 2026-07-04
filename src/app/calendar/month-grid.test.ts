import { describe, expect, it } from "vitest";
import type { CalendarAbsence } from "./actions";
import { absencesForDay, buildMonthGrid } from "./month-grid";

describe("buildMonthGrid", () => {
  it("červenec 2026 (1. je středa) — 2 dny přesahu z června, 35 buněk (5 týdnů)", () => {
    const cells = buildMonthGrid(2026, 7);
    expect(cells).toHaveLength(35);

    expect(cells[0]).toEqual({ dateKey: "2026-06-29", day: 29, isCurrentMonth: false });
    expect(cells[1]).toEqual({ dateKey: "2026-06-30", day: 30, isCurrentMonth: false });
    expect(cells[2]).toEqual({ dateKey: "2026-07-01", day: 1, isCurrentMonth: true });
    expect(cells[32]).toEqual({ dateKey: "2026-07-31", day: 31, isCurrentMonth: true });
    expect(cells[33]).toEqual({ dateKey: "2026-08-01", day: 1, isCurrentMonth: false });
    expect(cells[34]).toEqual({ dateKey: "2026-08-02", day: 2, isCurrentMonth: false });
  });

  it("únor 2026 (1. je neděle, 28 dní) — 6 dní přesahu, 35 buněk", () => {
    const cells = buildMonthGrid(2026, 2);
    expect(cells).toHaveLength(35);

    expect(cells[0]).toEqual({ dateKey: "2026-01-26", day: 26, isCurrentMonth: false });
    expect(cells[5]).toEqual({ dateKey: "2026-01-31", day: 31, isCurrentMonth: false });
    expect(cells[6]).toEqual({ dateKey: "2026-02-01", day: 1, isCurrentMonth: true });
    expect(cells[33]).toEqual({ dateKey: "2026-02-28", day: 28, isCurrentMonth: true });
    expect(cells[34]).toEqual({ dateKey: "2026-03-01", day: 1, isCurrentMonth: false });
  });

  it("první sloupec je vždy pondělí (obsahuje jen dny, které v UTC vycházejí na pondělí)", () => {
    const cells = buildMonthGrid(2026, 7);
    for (let week = 0; week < cells.length / 7; week++) {
      const monday = cells[week * 7];
      const weekday = new Date(`${monday.dateKey}T00:00:00Z`).getUTCDay();
      expect(weekday).toBe(1);
    }
  });
});

function fakeAbsence(id: string, fromDate: string, toDate: string): CalendarAbsence {
  return { id, fromDate, toDate, displayName: `Main-${id}`, characterClass: "Priest" };
}

describe("absencesForDay", () => {
  const absences = [
    fakeAbsence("single", "2026-07-10", "2026-07-10"),
    fakeAbsence("range", "2026-07-12", "2026-07-15"),
  ];

  it("jednodenní absence se vrátí přesně pro svůj den, ne pro sousední", () => {
    expect(absencesForDay(absences, "2026-07-10").map((a) => a.id)).toEqual(["single"]);
    expect(absencesForDay(absences, "2026-07-09")).toEqual([]);
    expect(absencesForDay(absences, "2026-07-11")).toEqual([]);
  });

  it("víc-denní rozsah pokrývá včetně obou krajních dnů", () => {
    expect(absencesForDay(absences, "2026-07-12").map((a) => a.id)).toEqual(["range"]);
    expect(absencesForDay(absences, "2026-07-13").map((a) => a.id)).toEqual(["range"]);
    expect(absencesForDay(absences, "2026-07-15").map((a) => a.id)).toEqual(["range"]);
    expect(absencesForDay(absences, "2026-07-16")).toEqual([]);
  });

  it("popup má k dispozici odvozené (main) zobrazovací jméno hráče", () => {
    const [entry] = absencesForDay(absences, "2026-07-10");
    expect(entry.displayName).toBe("Main-single");
  });
});
