"use client";

import { useRef, useState, useTransition } from "react";
import { restoreFormValues } from "@/lib/form-restore";
import { createRaid } from "./actions";
import { fieldForRaidFormError } from "./raid-validation";

const SIGNUP_MODES = ["ALL", "SINGLE"] as const;

export function RaidForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    setErrorField(null);
    startTransition(async () => {
      try {
        await createRaid(formData);
        formRef.current?.reset();
      } catch (e) {
        const message = e instanceof Error ? e.message : "Něco se pokazilo.";
        setError(message);
        setErrorField(fieldForRaidFormError(message));
        // React po dokončení action funkce resetuje uncontrolled inputy, i když
        // jsme chybu sami zachytili — vrátíme zpět, co uživatel vyplnil.
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
        Instance
        <input name="instance" required style={fieldStyle("instance")} />
      </label>
      <label>
        Začátek
        <input name="startsAt" type="datetime-local" required style={fieldStyle("startsAt")} />
      </label>
      <label>
        Konec
        <input name="endsAt" type="datetime-local" required style={fieldStyle("endsAt")} />
      </label>
      <label>
        Signup mode
        <select name="signupMode" defaultValue="SINGLE" required style={fieldStyle("signupMode")}>
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
          defaultValue={20}
          required
          style={fieldStyle("capacity")}
        />
      </label>
      <label>
        Poznámka
        <textarea name="notes" rows={2} />
      </label>

      {error && <p style={{ color: "#ff6b6b" }}>{error}</p>}

      <button type="submit" disabled={isPending}>
        Vytvořit raid
      </button>
    </form>
  );
}
