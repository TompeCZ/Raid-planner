"use client";

import { useRef, useState, useTransition } from "react";
import type { Absence } from "@/db/schema";
import { createAbsence, updateAbsence } from "./actions";

export function AbsenceForm({ absence, onDone }: { absence?: Absence; onDone?: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        if (absence) {
          await updateAbsence(absence.id, formData);
        } else {
          await createAbsence(formData);
          formRef.current?.reset();
        }
        onDone?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Něco se pokazilo.");
      }
    });
  }

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      style={{ display: "grid", gap: "0.6rem", maxWidth: 420 }}
    >
      <label>
        Od
        <input name="fromDate" type="date" defaultValue={absence?.fromDate} required />
      </label>
      <label>
        Do
        <input name="toDate" type="date" defaultValue={absence?.toDate} required />
      </label>
      <label>
        Poznámka
        <textarea name="note" defaultValue={absence?.note ?? ""} rows={2} />
      </label>

      {error && <p style={{ color: "#ff6b6b" }}>{error}</p>}

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button type="submit" disabled={isPending}>
          {absence ? "Uložit" : "Nahlásit absenci"}
        </button>
        {absence && (
          <button type="button" onClick={onDone} disabled={isPending}>
            Zrušit úpravu
          </button>
        )}
      </div>
    </form>
  );
}
