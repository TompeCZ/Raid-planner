"use client";

import { useState, useTransition } from "react";
import type { Raid } from "@/db/schema";
import { updateRaid, cancelRaid } from "./actions";

const SIGNUP_MODES = ["ALL", "SINGLE"] as const;

/** `Date` -> hodnota pro `<input type="datetime-local">` v místním čase prohlížeče. */
function toDateTimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function RaidHeader({ raid, canManage }: { raid: Raid; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleUpdate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await updateRaid(raid.id, formData);
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Něco se pokazilo.");
      }
    });
  }

  function handleCancel() {
    if (!confirm(`Zrušit raid ${raid.instance}?`)) return;
    setError(null);
    startTransition(async () => {
      try {
        await cancelRaid(raid.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Něco se pokazilo.");
      }
    });
  }

  if (editing) {
    return (
      <form action={handleUpdate} style={{ display: "grid", gap: "0.6rem", maxWidth: 420 }}>
        <label>
          Instance
          <input name="instance" defaultValue={raid.instance} required />
        </label>
        <label>
          Začátek
          <input
            name="startsAt"
            type="datetime-local"
            defaultValue={toDateTimeLocalValue(raid.startsAt)}
            required
          />
        </label>
        <label>
          Konec
          <input
            name="endsAt"
            type="datetime-local"
            defaultValue={toDateTimeLocalValue(raid.endsAt)}
            required
          />
        </label>
        <label>
          Signup mode
          <select name="signupMode" defaultValue={raid.signupMode} required>
            {SIGNUP_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label>
          Kapacita
          <input name="capacity" type="number" min={1} defaultValue={raid.capacity} required />
        </label>
        <label>
          Poznámka
          <textarea name="notes" rows={2} defaultValue={raid.notes ?? ""} />
        </label>

        {error && <p style={{ color: "#ff6b6b" }}>{error}</p>}

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="submit" disabled={isPending}>
            Uložit
          </button>
          <button type="button" onClick={() => setEditing(false)} disabled={isPending}>
            Zrušit úpravu
          </button>
        </div>
      </form>
    );
  }

  return (
    <div>
      <h1>{raid.instance}</h1>
      <p style={{ opacity: 0.7 }}>
        {raid.startsAt.toLocaleString("cs-CZ")} – {raid.endsAt.toLocaleString("cs-CZ")}
        {" · "}mode {raid.signupMode} · kapacita {raid.capacity} · stav {raid.status}
      </p>
      {raid.notes && <p style={{ opacity: 0.7 }}>{raid.notes}</p>}
      {error && <p style={{ color: "#ff6b6b" }}>{error}</p>}
      {canManage && raid.status === "OPEN" && (
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button onClick={() => setEditing(true)}>Upravit raid</button>
          <button onClick={handleCancel} disabled={isPending}>
            Zrušit raid
          </button>
        </div>
      )}
    </div>
  );
}
