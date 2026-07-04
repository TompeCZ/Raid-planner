"use client";

import { useRef, useState, useTransition } from "react";
import type { Absence } from "@/db/schema";
import { restoreFormValues } from "@/lib/form-restore";
import { createAbsence, updateAbsence } from "./actions";
import { fieldForAbsenceFormError } from "./absence-validation";

export function AbsenceForm({ absence, onDone }: { absence?: Absence; onDone?: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    setErrorField(null);
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
        const message = e instanceof Error ? e.message : "Něco se pokazilo.";
        setError(message);
        setErrorField(fieldForAbsenceFormError(message));
        restoreFormValues(formRef.current, formData);
      }
    });
  }

  function fieldStyle(name: string): React.CSSProperties | undefined {
    return errorField === name ? { borderColor: "#ff6b6b", outline: "1px solid #ff6b6b" } : undefined;
  }

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      style={{ display: "grid", gap: "0.6rem", maxWidth: 420 }}
    >
      <label>
        Od
        <input
          name="fromDate"
          type="date"
          defaultValue={absence?.fromDate}
          required
          style={fieldStyle("fromDate")}
        />
      </label>
      <label>
        Do
        <input
          name="toDate"
          type="date"
          defaultValue={absence?.toDate}
          required
          style={fieldStyle("toDate")}
        />
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
