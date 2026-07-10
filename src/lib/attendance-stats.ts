/**
 * Čisté (bez DB) statistiky docházky — DB dotazy žijí v `attendance-query.ts`,
 * tenhle modul jen agreguje už načtená data. `pct` je 0–100 (ne 0–1), `null`
 * když je jmenovatel 0 (UI zobrazí „—", ne 0 %) — hráč jen s ABSENCE tak
 * dostane „—" na Docházku, ne 0 %.
 */
import type { attendanceStatus } from "@/db/schema";

export type AttendanceStatus = (typeof attendanceStatus.enumValues)[number];
export type AssignmentRole = "CONFIRMED" | "BENCH" | null;

export type AttendanceStatsEntry = { status: AttendanceStatus; role: AssignmentRole };

export type Metric = { pct: number | null; num: number; den: number };

export type AttendanceStats = {
  attendance: Metric;
  noShow: Metric;
  absenceFrequency: Metric;
  played: Metric;
  punctuality: Metric;
};

export type AttendanceBucket = "ARRIVED" | "EXCUSED" | "NO_SHOW";

/** Sdílené formátování metriky pro UI (leaderboard i profil hráče) — „—" místo 0 %, když den=0. */
export function formatMetricPct(m: Metric): string {
  return m.pct === null ? `— (${m.num}/${m.den})` : `${m.pct.toFixed(0)} % (${m.num}/${m.den})`;
}

/** DORAZIL/OMLUVEN/NEDORAZIL kýbly ze zadání — sdíleno i s per-raid souhrnem. */
export function bucketForStatus(status: AttendanceStatus): AttendanceBucket {
  if (status === "ABSENCE") return "EXCUSED";
  if (status === "NO_SHOW") return "NO_SHOW";
  return "ARRIVED"; // PRESENT, LATE_EXCUSED, LATE_NO_EXCUSE, LEFT_EARLY
}

const LATE_OR_EARLY = new Set<AttendanceStatus>(["LATE_EXCUSED", "LATE_NO_EXCUSE", "LEFT_EARLY"]);

function metric(num: number, den: number): Metric {
  return { pct: den > 0 ? (num / den) * 100 : null, num, den };
}

/**
 * Pět metrik přes zadanou populaci záznamů (viz zadání pro přesné vzorce):
 * Docházka/No-show/Frekvence absencí ze tří kýblů; Played % jen z DORAZIL
 * záznamů podle role (CONFIRMED vs. CONFIRMED+BENCH); Punktualita = podíl
 * pozdních/předčasných odchodů mezi DORAZIL (víc = častěji pozdě/dřív).
 */
export function computeAttendanceStats(entries: AttendanceStatsEntry[]): AttendanceStats {
  let arrived = 0;
  let noShow = 0;
  let excused = 0;
  let lateOrEarly = 0;
  let confirmedArrived = 0;
  let confirmedOrBenchArrived = 0;

  for (const entry of entries) {
    const bucket = bucketForStatus(entry.status);
    if (bucket === "ARRIVED") {
      arrived++;
      if (LATE_OR_EARLY.has(entry.status)) lateOrEarly++;
      if (entry.role === "CONFIRMED" || entry.role === "BENCH") {
        confirmedOrBenchArrived++;
        if (entry.role === "CONFIRMED") confirmedArrived++;
      }
    } else if (bucket === "NO_SHOW") {
      noShow++;
    } else {
      excused++;
    }
  }

  return {
    attendance: metric(arrived, arrived + noShow),
    noShow: metric(noShow, arrived + noShow),
    absenceFrequency: metric(excused, arrived + noShow + excused),
    played: metric(confirmedArrived, confirmedOrBenchArrived),
    punctuality: metric(lateOrEarly, arrived),
  };
}
