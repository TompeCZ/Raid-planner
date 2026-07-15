import type { RosterOverviewRow } from "@/lib/notes-query";
import { RosterRow } from "./roster-row";

const headerCellStyle = { textAlign: "left" as const, padding: "0.3rem 0.5rem" };

/** Statické pořadí (guild_rank -> jméno, viz `getRosterOverview`), žádné klikací řazení sloupců. */
export function RosterTable({ rows }: { rows: RosterOverviewRow[] }) {
  if (rows.length === 0) {
    return <p style={{ opacity: 0.7 }}>Žádní hráči neodpovídají filtru.</p>;
  }

  return (
    <table style={{ borderCollapse: "collapse", width: "100%" }}>
      <thead>
        <tr>
          <th style={headerCellStyle}>Hráč</th>
          <th style={headerCellStyle}>Rank</th>
          <th style={headerCellStyle} title="Počet za zvolené období, viz filtr výše">
            Poznámky (za období)
          </th>
          <th style={headerCellStyle}>Docházka</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <RosterRow key={r.userId} row={r} />
        ))}
      </tbody>
    </table>
  );
}
