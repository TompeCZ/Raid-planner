"use client";

import { useState, useTransition } from "react";
import type { CSSProperties } from "react";
import type { Absence } from "@/db/schema";
import { createAbsence, updateAbsence } from "./actions";
import { fieldForAbsenceFormError } from "./absence-validation";

function deriveValues(absence?: Absence) {
  return {
    fromDate: absence?.fromDate ?? "",
    toDate: absence?.toDate ?? "",
    note: absence?.note ?? "",
  };
}

type Values = ReturnType<typeof deriveValues>;

export function AbsenceForm({ absence, onDone }: { absence?: Absence; onDone?: () => void }) {
  // AbsenceRow renderuje tuhle komponentu jen podmíněně (`if (editing) return <AbsenceForm .../>`),
  // takže při každém otevření editace jde o čerstvý mount — initializer stačí spustit jednou.
  const [values, setValues] = useState<Values>(() => deriveValues(absence));
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function setField<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    setErrorField(null);
    startTransition(async () => {
      try {
        if (absence) {
          await updateAbsence(absence.id, formData);
        } else {
          await createAbsence(formData);
          setValues(deriveValues());
        }
        onDone?.();
      } catch (e) {
        const message = e instanceof Error ? e.message : "Něco se pokazilo.";
        setError(message);
        setErrorField(fieldForAbsenceFormError(message));
      }
    });
  }

  function fieldStyle(name: string): CSSProperties | undefined {
    return errorField === name ? { borderColor: "#ff6b6b", outline: "1px solid #ff6b6b" } : undefined;
  }

  return (
    <form action={handleSubmit} style={{ display: "grid", gap: "0.6rem", maxWidth: 420 }}>
      <label>
        Od
        <input
          name="fromDate"
          type="date"
          value={values.fromDate}
          onChange={(e) => setField("fromDate", e.target.value)}
          required
          style={fieldStyle("fromDate")}
        />
      </label>
      <label>
        Do
        <input
          name="toDate"
          type="date"
          value={values.toDate}
          onChange={(e) => setField("toDate", e.target.value)}
          required
          style={fieldStyle("toDate")}
        />
      </label>
      <label>
        Poznámka
        <textarea
          name="note"
          rows={2}
          value={values.note}
          onChange={(e) => setField("note", e.target.value)}
        />
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
