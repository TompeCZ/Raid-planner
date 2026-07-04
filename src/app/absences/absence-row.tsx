"use client";

import { useState, useTransition } from "react";
import type { Absence } from "@/db/schema";
import { cancelAbsence } from "./actions";
import { AbsenceForm } from "./absence-form";

export function AbsenceRow({ absence }: { absence: Absence }) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (editing) {
    return (
      <li style={{ listStyle: "none", padding: "1rem 0", borderBottom: "1px solid #333" }}>
        <AbsenceForm absence={absence} onDone={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li
      style={{
        listStyle: "none",
        padding: "1rem 0",
        borderBottom: "1px solid #333",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "1rem",
      }}
    >
      <div>
        <strong>
          {absence.fromDate} – {absence.toDate}
        </strong>
        {absence.note && <div style={{ fontSize: "0.85rem", opacity: 0.7 }}>{absence.note}</div>}
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
        <button onClick={() => setEditing(true)}>Upravit</button>
        <button
          disabled={isPending}
          onClick={() => {
            if (!confirm(`Zrušit absenci ${absence.fromDate} – ${absence.toDate}?`)) return;
            startTransition(async () => {
              await cancelAbsence(absence.id);
            });
          }}
        >
          Zrušit
        </button>
      </div>
    </li>
  );
}
