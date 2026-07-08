/**
 * Odvození počáteční docházky při přechodu raidu do DONE. Čistá funkce (žádná
 * DB) — dotazy a insert žijí v `actions.ts#setRaidStatus`, tenhle modul jen
 * rozhodne PRESENT/ABSENCE ze už načtených dat. Odděleno kvůli testovatelnosti
 * (viz CLAUDE.md konvence pro `server-only` řetězec).
 */
export type SeedAbsenceRange = {
  fromDate: string; // YYYY-MM-DD
  toDate: string; // YYYY-MM-DD, inkluzivní
  note: string | null;
};

export type SeededAttendanceEntry = {
  userId: string;
  status: "PRESENT" | "ABSENCE";
  note: string | null;
};

/**
 * Pro každého hráče z rosteru (distinct userId ze CONFIRMED+BENCH assignmentů)
 * rozhodne PRESENT, nebo ABSENCE (má-li aktivní absenci pokrývající den raidu —
 * `pragueDateKey`, YYYY-MM-DD v Europe/Prague). Řetězcové porovnání dat funguje
 * díky ISO formátu, stejná konvence jako `absence-validation.ts`.
 */
export function deriveSeededAttendance(
  rosterUserIds: string[],
  absencesByUser: Map<string, SeedAbsenceRange[]>,
  pragueDateKey: string,
): SeededAttendanceEntry[] {
  return rosterUserIds.map((userId) => {
    const activeAbsence = (absencesByUser.get(userId) ?? []).find(
      (a) => a.fromDate <= pragueDateKey && pragueDateKey <= a.toDate,
    );
    return activeAbsence
      ? { userId, status: "ABSENCE" as const, note: activeAbsence.note }
      : { userId, status: "PRESENT" as const, note: null };
  });
}
