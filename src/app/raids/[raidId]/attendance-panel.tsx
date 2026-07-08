"use client";

import { useState, useTransition } from "react";
import { setAttendance, type AttendanceRow, type AttendanceStatus } from "./actions";

const ATTENDANCE_STATUSES: AttendanceStatus[] = [
  "PRESENT",
  "LATE_EXCUSED",
  "LATE_NO_EXCUSE",
  "NO_SHOW",
  "LEFT_EARLY",
  "ABSENCE",
];

type Props = {
  raidId: string;
  attendance: AttendanceRow[];
  readOnly: boolean;
};

function AttendanceRowView({ raidId, row, readOnly }: { raidId: string; row: AttendanceRow; readOnly: boolean }) {
  const [status, setStatus] = useState(row.status);
  const [note, setNote] = useState(row.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(nextStatus: AttendanceStatus, nextNote: string) {
    setError(null);
    startTransition(async () => {
      try {
        await setAttendance(raidId, row.userId, nextStatus, nextNote);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Něco se pokazilo.");
      }
    });
  }

  return (
    <tr>
      <td>{row.displayName}</td>
      <td style={{ opacity: 0.7, fontSize: "0.85rem" }}>{row.assignmentStatus ?? "—"}</td>
      <td>
        {readOnly ? (
          status
        ) : (
          <select
            value={status}
            disabled={isPending}
            onChange={(e) => {
              const next = e.target.value as AttendanceStatus;
              setStatus(next);
              save(next, note);
            }}
          >
            {ATTENDANCE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
      </td>
      <td>
        {readOnly ? (
          note || "—"
        ) : (
          <input
            value={note}
            disabled={isPending}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => save(status, note)}
            placeholder="poznámka"
          />
        )}
      </td>
      {error && (
        <td style={{ color: "#ff6b6b", fontSize: "0.8rem" }}>{error}</td>
      )}
    </tr>
  );
}

/** Panel docházky na detailu raidu — jen raid.status === DONE (viz page.tsx). RL/ADMIN edituje, ostatní jen čtou. */
export function AttendancePanel({ raidId, attendance, readOnly }: Props) {
  if (attendance.length === 0) {
    return <p style={{ opacity: 0.7 }}>Docházka zatím nebyla vygenerována.</p>;
  }

  return (
    <table style={{ borderCollapse: "collapse", width: "100%" }}>
      <thead>
        <tr style={{ textAlign: "left" }}>
          <th>Hráč</th>
          <th>Role</th>
          <th>Docházka</th>
          <th>Poznámka</th>
        </tr>
      </thead>
      <tbody>
        {attendance.map((row) => (
          <AttendanceRowView key={row.userId} raidId={raidId} row={row} readOnly={readOnly} />
        ))}
      </tbody>
    </table>
  );
}
