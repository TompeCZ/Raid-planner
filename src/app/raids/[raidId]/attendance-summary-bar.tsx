import { bucketForStatus } from "@/lib/attendance-stats";
import type { AttendanceRow } from "./actions";

/**
 * Veřejný, read-only souhrn docházky nad `AttendancePanel` — jen počty po
 * kýblech + krátké seznamy jmen. Nesahá na RL-editovatelný panel, jen čte
 * stejná data (`attendance` z `getRaidPageData`).
 */
export function AttendanceSummaryBar({ attendance }: { attendance: AttendanceRow[] }) {
  if (attendance.length === 0) return null;

  const arrived = attendance.filter((a) => bucketForStatus(a.status) === "ARRIVED");
  const noShow = attendance.filter((a) => bucketForStatus(a.status) === "NO_SHOW");
  const excused = attendance.filter((a) => bucketForStatus(a.status) === "EXCUSED");

  return (
    <div style={{ border: "1px solid #333", borderRadius: 6, padding: "0.6rem 0.75rem", margin: "0.75rem 0", fontSize: "0.9rem" }}>
      <strong>
        Dorazilo {arrived.length} · no-show {noShow.length} · omluveno {excused.length}
      </strong>
      <div style={{ display: "grid", gap: "0.25rem", marginTop: "0.4rem", opacity: 0.85 }}>
        {arrived.length > 0 && <div>Dorazili: {arrived.map((a) => a.displayName).join(", ")}</div>}
        {noShow.length > 0 && <div>No-show: {noShow.map((a) => a.displayName).join(", ")}</div>}
        {excused.length > 0 && <div>Omluveni: {excused.map((a) => a.displayName).join(", ")}</div>}
      </div>
    </div>
  );
}
