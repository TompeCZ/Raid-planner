"use client";

import { useRef, useState, useTransition } from "react";
import { createRaid } from "./actions";

const SIGNUP_MODES = ["ALL", "SINGLE"] as const;

export function RaidForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await createRaid(formData);
        formRef.current?.reset();
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
        Instance
        <input name="instance" required />
      </label>
      <label>
        Začátek
        <input name="startsAt" type="datetime-local" required />
      </label>
      <label>
        Konec
        <input name="endsAt" type="datetime-local" required />
      </label>
      <label>
        Signup mode
        <select name="signupMode" defaultValue="SINGLE" required>
          {SIGNUP_MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <label>
        Kapacita
        <input name="capacity" type="number" min={1} defaultValue={20} required />
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
