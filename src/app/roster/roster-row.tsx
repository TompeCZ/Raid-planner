"use client";

import { useRouter } from "next/navigation";
import { classColor } from "@/app/calendar/day-markers";
import { formatMetricPct } from "@/lib/attendance-stats";
import type { RosterOverviewRow } from "@/lib/notes-query";

const cellStyle = { padding: "0.3rem 0.5rem" };

/** Celý řádek klikatelný -> `/roster/[userId]` (dossier). */
export function RosterRow({ row }: { row: RosterOverviewRow }) {
  const router = useRouter();

  return (
    <tr onClick={() => router.push(`/roster/${row.userId}`)} style={{ cursor: "pointer" }}>
      <td style={{ ...cellStyle, color: classColor(row.mainCharacterClass) ?? undefined }}>
        {row.displayName}
      </td>
      <td style={cellStyle}>{row.guildRank ?? "—"}</td>
      <td style={cellStyle}>
        {row.noteCount}
        {row.hasOpenConcern && (
          <span title="Otevřený concern" style={{ marginLeft: "0.35rem" }}>
            ⚠
          </span>
        )}
      </td>
      <td style={cellStyle}>{formatMetricPct(row.stats.attendance)}</td>
    </tr>
  );
}
