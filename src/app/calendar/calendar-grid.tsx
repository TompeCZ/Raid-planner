"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AbsenceChip, RaidMarkerPill } from "./day-markers";
import type { CalendarMonthData } from "./actions";
import { absencesForDay, buildMonthGrid } from "./month-grid";

const WEEKDAY_LABELS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const TIME_FORMAT = new Intl.DateTimeFormat("cs-CZ", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Prague",
});

type Props = {
  year: number;
  month: number;
  todayKey: string;
  data: CalendarMonthData;
};

/** `YYYY-MM-DD` -> `DD. MM.` (jednoduché lidské formátování bez další knihovny/TZ). */
function formatDateKeyShort(dateKey: string): string {
  const [, m, d] = dateKey.split("-");
  return `${Number(d)}. ${Number(m)}.`;
}

export function CalendarGrid({ year, month, todayKey, data }: Props) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);

  const selectedAbsences = useMemo(
    () => (selectedDay ? absencesForDay(data.absences, selectedDay) : []),
    [selectedDay, data.absences],
  );
  const selectedRaids = selectedDay ? (data.raidsByDay[selectedDay] ?? []) : [];

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: "0.3rem",
          fontSize: "0.75rem",
          opacity: 0.6,
          marginBottom: "0.3rem",
          textAlign: "center",
        }}
      >
        {WEEKDAY_LABELS.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "0.3rem" }}>
        {cells.map((cell) => {
          const dayAbsences = absencesForDay(data.absences, cell.dateKey);
          const dayRaids = data.raidsByDay[cell.dateKey] ?? [];
          const isToday = cell.dateKey === todayKey;
          const isSelected = cell.dateKey === selectedDay;

          return (
            <button
              key={cell.dateKey}
              type="button"
              onMouseEnter={() => setSelectedDay(cell.dateKey)}
              onClick={() => setSelectedDay((cur) => (cur === cell.dateKey ? null : cell.dateKey))}
              style={{
                textAlign: "left",
                border: isToday ? "1px solid #4ea1ff" : "1px solid #333",
                background: isSelected ? "#22262e" : "transparent",
                borderRadius: 6,
                padding: "0.3rem",
                minHeight: "3.2rem",
                opacity: cell.isCurrentMonth ? 1 : 0.35,
                display: "flex",
                flexDirection: "column",
                gap: "0.2rem",
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: "0.8rem" }}>{cell.day}</span>

              {dayRaids.length > 0 && (
                <RaidMarkerPill
                  instance={dayRaids.length === 1 ? dayRaids[0].instance : `${dayRaids.length}× raid`}
                  title={dayRaids.map((r) => `${r.instance} (${TIME_FORMAT.format(r.startsAt)})`).join(", ")}
                />
              )}

              {dayAbsences.length > 0 && (
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: "#e8b339",
                    opacity: 0.8,
                    marginTop: "auto",
                  }}
                  title={`${dayAbsences.length} absence`}
                />
              )}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: "1rem", borderTop: "1px solid #333", paddingTop: "0.75rem" }}>
        {selectedDay ? (
          <>
            <h3 style={{ margin: "0 0 0.5rem" }}>{formatDateKeyShort(selectedDay)}</h3>
            {selectedRaids.length === 0 && selectedAbsences.length === 0 ? (
              <p style={{ opacity: 0.6, fontSize: "0.9rem" }}>Žádné raidy ani absence tento den.</p>
            ) : (
              <div style={{ display: "grid", gap: "0.75rem" }}>
                {selectedRaids.length > 0 && (
                  <div style={{ display: "grid", gap: "0.4rem" }}>
                    {selectedRaids.map((r) => (
                      <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <Link href={`/raids/${r.id}`}>
                          <RaidMarkerPill instance={r.instance} full />
                        </Link>
                        <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>
                          {TIME_FORMAT.format(r.startsAt)}–{TIME_FORMAT.format(r.endsAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {selectedAbsences.length > 0 && (
                  <div style={{ display: "grid", gap: "0.4rem" }}>
                    {selectedAbsences.map((a) => (
                      <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <AbsenceChip displayName={a.displayName} characterClass={a.characterClass} />
                        <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>
                          {a.fromDate === a.toDate
                            ? formatDateKeyShort(a.fromDate)
                            : `${formatDateKeyShort(a.fromDate)} – ${formatDateKeyShort(a.toDate)}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <p style={{ opacity: 0.5, fontSize: "0.9rem" }}>Klikni (nebo najeď) na den pro detail raidů a absencí.</p>
        )}
      </div>
    </div>
  );
}
