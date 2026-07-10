import { describe, expect, it } from "vitest";
import { bucketForStatus, computeAttendanceStats, type AttendanceStatsEntry } from "./attendance-stats";

describe("bucketForStatus", () => {
  it("ABSENCE je EXCUSED, NO_SHOW je NO_SHOW, zbytek ARRIVED", () => {
    expect(bucketForStatus("ABSENCE")).toBe("EXCUSED");
    expect(bucketForStatus("NO_SHOW")).toBe("NO_SHOW");
    expect(bucketForStatus("PRESENT")).toBe("ARRIVED");
    expect(bucketForStatus("LATE_EXCUSED")).toBe("ARRIVED");
    expect(bucketForStatus("LATE_NO_EXCUSE")).toBe("ARRIVED");
    expect(bucketForStatus("LEFT_EARLY")).toBe("ARRIVED");
  });
});

describe("computeAttendanceStats", () => {
  it("prázdný vstup dá všude null pct a 0/0", () => {
    const stats = computeAttendanceStats([]);
    for (const metric of Object.values(stats)) {
      expect(metric).toEqual({ pct: null, num: 0, den: 0 });
    }
  });

  it("hráč jen s ABSENCE má docházku null (v UI pomlčka), ne 0 %", () => {
    const entries: AttendanceStatsEntry[] = [{ status: "ABSENCE", role: null }];
    const stats = computeAttendanceStats(entries);
    expect(stats.attendance).toEqual({ pct: null, num: 0, den: 0 });
    expect(stats.noShow).toEqual({ pct: null, num: 0, den: 0 });
    expect(stats.absenceFrequency).toEqual({ pct: 100, num: 1, den: 1 });
  });

  it("18 PRESENT + 2 NO_SHOW -> docházka 90 %, no-show 10 %", () => {
    const entries: AttendanceStatsEntry[] = [
      ...Array.from({ length: 18 }, (): AttendanceStatsEntry => ({ status: "PRESENT", role: "CONFIRMED" })),
      ...Array.from({ length: 2 }, (): AttendanceStatsEntry => ({ status: "NO_SHOW", role: "CONFIRMED" })),
    ];
    const stats = computeAttendanceStats(entries);
    expect(stats.attendance).toEqual({ pct: 90, num: 18, den: 20 });
    expect(stats.noShow).toEqual({ pct: 10, num: 2, den: 20 });
  });

  it("frekvence absencí zahrnuje DORAZIL + NEDORAZIL + OMLUVEN ve jmenovateli", () => {
    const entries: AttendanceStatsEntry[] = [
      { status: "PRESENT", role: "CONFIRMED" },
      { status: "PRESENT", role: "CONFIRMED" },
      { status: "NO_SHOW", role: "CONFIRMED" },
      { status: "ABSENCE", role: null },
    ];
    const stats = computeAttendanceStats(entries);
    // DORAZIL=2, NEDORAZIL=1, OMLUVEN=1 -> 1/4 = 25 %
    expect(stats.absenceFrequency).toEqual({ pct: 25, num: 1, den: 4 });
  });

  it("played % počítá jen z DORAZIL záznamů: CONFIRMED-dorazil / (CONFIRMED+BENCH)-dorazil", () => {
    const entries: AttendanceStatsEntry[] = [
      { status: "PRESENT", role: "CONFIRMED" },
      { status: "PRESENT", role: "CONFIRMED" },
      { status: "PRESENT", role: "BENCH" },
      // NO_SHOW se do played % nepočítá vůbec (není DORAZIL), i kdyby role byla CONFIRMED.
      { status: "NO_SHOW", role: "CONFIRMED" },
    ];
    const stats = computeAttendanceStats(entries);
    expect(stats.played).toEqual({ pct: (2 / 3) * 100, num: 2, den: 3 });
  });

  it("played % má null, když hráč nikdy nedorazil s rolí CONFIRMED/BENCH (např. jen NO_SHOW)", () => {
    const entries: AttendanceStatsEntry[] = [{ status: "NO_SHOW", role: "CONFIRMED" }];
    const stats = computeAttendanceStats(entries);
    expect(stats.played).toEqual({ pct: null, num: 0, den: 0 });
  });

  it("punktualita = (LATE_EXCUSED+LATE_NO_EXCUSE+LEFT_EARLY) / DORAZIL", () => {
    const entries: AttendanceStatsEntry[] = [
      { status: "PRESENT", role: "CONFIRMED" },
      { status: "LATE_EXCUSED", role: "CONFIRMED" },
      { status: "LATE_NO_EXCUSE", role: "CONFIRMED" },
      { status: "LEFT_EARLY", role: "CONFIRMED" },
    ];
    const stats = computeAttendanceStats(entries);
    // DORAZIL=4 (všechny), pozdě/dřív=3 -> 75 %
    expect(stats.punctuality).toEqual({ pct: 75, num: 3, den: 4 });
  });

  it("role null (bez assignmentu) se do played % nepočítá", () => {
    const entries: AttendanceStatsEntry[] = [
      { status: "PRESENT", role: null },
      { status: "PRESENT", role: "CONFIRMED" },
    ];
    const stats = computeAttendanceStats(entries);
    expect(stats.played).toEqual({ pct: 100, num: 1, den: 1 });
  });
});
