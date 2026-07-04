import type { CalendarAbsence } from "./actions";

export type CalendarCell = {
  dateKey: string;
  day: number;
  isCurrentMonth: boolean;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Buňky pro měsíční mřížku (týden Po–Ne), doplněné přesahem z
 * předchozího/následujícího měsíce na celé týdny. `year`/`month` jsou lidské
 * (month 1–12).
 */
export function buildMonthGrid(year: number, month: number): CalendarCell[] {
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  // JS getUTCDay(): 0=neděle..6=sobota. Chceme pondělí jako první sloupec.
  const mondayIndexed = (firstOfMonth.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const totalCells = Math.ceil((mondayIndexed + daysInMonth) / 7) * 7;

  const cells: CalendarCell[] = [];
  for (let i = 0; i < totalCells; i++) {
    const dayOffset = i - mondayIndexed;
    const date = new Date(Date.UTC(year, month - 1, 1 + dayOffset));
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    cells.push({
      dateKey: `${y}-${pad2(m)}-${pad2(d)}`,
      day: d,
      isCurrentMonth: y === year && m === month,
    });
  }
  return cells;
}

/** Absence pokrývající daný den — `fromDate`/`toDate` jsou DATE stringy (YYYY-MM-DD), porovnatelné jako ISO. */
export function absencesForDay(absences: CalendarAbsence[], dateKey: string): CalendarAbsence[] {
  return absences.filter((a) => a.fromDate <= dateKey && dateKey <= a.toDate);
}
