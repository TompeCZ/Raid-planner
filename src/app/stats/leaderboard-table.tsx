"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatMetricPct } from "@/lib/attendance-stats";
import type { LeaderboardRow } from "./actions";

type SortKey = "displayName" | "attendance" | "noShow" | "absenceFrequency" | "played" | "punctuality" | "raidCount";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "displayName", label: "Hráč" },
  { key: "attendance", label: "Docházka %" },
  { key: "noShow", label: "No-show %" },
  { key: "absenceFrequency", label: "Frekvence absencí %" },
  { key: "played", label: "Played %" },
  { key: "punctuality", label: "Punktualita %" },
  { key: "raidCount", label: "Raidů" },
];

function metricValue(row: LeaderboardRow, key: SortKey): number {
  if (key === "raidCount") return row.raidCount;
  if (key === "displayName") return 0;
  // null (chybí data) ať sedí na dně žebříčku, ne uprostřed jako 0 %.
  return row.stats[key].pct ?? -1;
}

/** Sdílené sloupce/formátování, jen podklad se liší (per hráč vs. celý guild). */
export function LeaderboardTable({ rows }: { rows: LeaderboardRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("attendance");
  const [sortDesc, setSortDesc] = useState(true);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sortKey === "displayName") {
        const cmp = a.displayName.localeCompare(b.displayName);
        return sortDesc ? -cmp : cmp;
      }
      const diff = metricValue(a, sortKey) - metricValue(b, sortKey);
      if (diff !== 0) return sortDesc ? -diff : diff;
      // Shoda -> víc odehraných raidů výš (default řazení ze zadání).
      return b.raidCount - a.raidCount;
    });
    return copy;
  }, [rows, sortKey, sortDesc]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDesc((d) => !d);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  if (rows.length === 0) {
    return <p style={{ opacity: 0.7 }}>V tomhle období nemá nikdo záznam docházky.</p>;
  }

  return (
    <table style={{ borderCollapse: "collapse", width: "100%" }}>
      <thead>
        <tr>
          {COLUMNS.map((c) => (
            <th
              key={c.key}
              onClick={() => handleSort(c.key)}
              style={{ cursor: "pointer", textAlign: "left", padding: "0.3rem 0.5rem", userSelect: "none" }}
            >
              {c.label}
              {sortKey === c.key ? (sortDesc ? " ▼" : " ▲") : ""}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr key={r.userId}>
            <td style={{ padding: "0.3rem 0.5rem" }}>
              <Link href={`/players/${r.userId}`}>{r.displayName}</Link>
            </td>
            <td style={{ padding: "0.3rem 0.5rem" }}>{formatMetricPct(r.stats.attendance)}</td>
            <td style={{ padding: "0.3rem 0.5rem" }}>{formatMetricPct(r.stats.noShow)}</td>
            <td style={{ padding: "0.3rem 0.5rem" }}>{formatMetricPct(r.stats.absenceFrequency)}</td>
            <td style={{ padding: "0.3rem 0.5rem" }}>{formatMetricPct(r.stats.played)}</td>
            <td style={{ padding: "0.3rem 0.5rem" }}>{formatMetricPct(r.stats.punctuality)}</td>
            <td style={{ padding: "0.3rem 0.5rem" }}>{r.raidCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
