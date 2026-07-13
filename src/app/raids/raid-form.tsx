"use client";

import { useState, useTransition } from "react";
import type { CSSProperties } from "react";
import { createRaid } from "./actions";
import { fieldForRaidFormError } from "./raid-validation";
import { DateTimeQuarterInput } from "./datetime-quarter-input";

const SIGNUP_MODES = ["ALL", "SINGLE"] as const;

const DEFAULT_VALUES = {
  instance: "",
  startsAt: "",
  endsAt: "",
  signupMode: "SINGLE" as (typeof SIGNUP_MODES)[number],
  capacity: "25",
  notes: "",
};

type Values = typeof DEFAULT_VALUES;

export function RaidForm() {
  const [values, setValues] = useState<Values>(DEFAULT_VALUES);
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
        await createRaid(formData);
        // Controlled inputy — resetujeme jen po úspěchu, na chybu nesaháme
        // (žádné spoléhání na to, kdy/jestli React sám resetuje DOM).
        setValues(DEFAULT_VALUES);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Něco se pokazilo.";
        setError(message);
        setErrorField(fieldForRaidFormError(message));
      }
    });
  }

  function fieldStyle(name: string): CSSProperties | undefined {
    return errorField === name ? { borderColor: "#ff6b6b", outline: "1px solid #ff6b6b" } : undefined;
  }

  return (
    <form action={handleSubmit} style={{ display: "grid", gap: "0.6rem", maxWidth: 420 }}>
      <label>
        Instance
        <input
          name="instance"
          value={values.instance}
          onChange={(e) => setField("instance", e.target.value)}
          required
          style={fieldStyle("instance")}
        />
      </label>
      <label>
        Začátek
        <br />
        <DateTimeQuarterInput
          name="startsAt"
          value={values.startsAt}
          onChange={(v) => setField("startsAt", v)}
          required
          style={fieldStyle("startsAt")}
          defaultHour="19"
        />
      </label>
      <label>
        Konec
        <br />
        <DateTimeQuarterInput
          name="endsAt"
          value={values.endsAt}
          onChange={(v) => setField("endsAt", v)}
          required
          style={fieldStyle("endsAt")}
          defaultHour="22"
        />
      </label>
      <label>
        Signup mode
        <select
          name="signupMode"
          value={values.signupMode}
          onChange={(e) => setField("signupMode", e.target.value as Values["signupMode"])}
          required
          style={fieldStyle("signupMode")}
        >
          {SIGNUP_MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <label>
        Kapacita
        <input
          name="capacity"
          type="number"
          min={1}
          value={values.capacity}
          onChange={(e) => setField("capacity", e.target.value)}
          required
          style={fieldStyle("capacity")}
        />
      </label>
      <label>
        Poznámka
        <textarea
          name="notes"
          rows={2}
          value={values.notes}
          onChange={(e) => setField("notes", e.target.value)}
        />
      </label>

      {error && <p style={{ color: "#ff6b6b" }}>{error}</p>}

      <button type="submit" disabled={isPending}>
        Vytvořit raid
      </button>
    </form>
  );
}
