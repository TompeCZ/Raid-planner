"use client";

import { useRef, useState, useTransition } from "react";
import type { Raid } from "@/db/schema";
import { restoreFormValues } from "@/lib/form-restore";
import { updateRaid, setRaidStatus } from "./actions";
import { fieldForRaidFormError } from "../raid-validation";
import {
  RAID_STATUS_TRANSITIONS,
  RAID_STATUS_ACTION_LABELS,
  isRaidEditable,
} from "../raid-status";

/** Destruktivní/koncové přechody chceme potvrdit; LOCKED/OPEN jsou vratné. */
const CONFIRMED_TRANSITIONS: Raid["status"][] = ["DONE", "CANCELLED"];

const SIGNUP_MODES = ["ALL", "SINGLE"] as const;

/** `Date` -> hodnota pro `<input type="datetime-local">` v místním čase prohlížeče. */
function toDateTimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function RaidHeader({ raid, canManage }: { raid: Raid; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleUpdate(formData: FormData) {
    setError(null);
    setErrorField(null);
    startTransition(async () => {
      try {
        await updateRaid(raid.id, formData);
        setEditing(false);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Něco se pokazilo.";
        setError(message);
        setErrorField(fieldForRaidFormError(message));
        restoreFormValues(formRef.current, formData);
      }
    });
  }

  function fieldStyle(name: string): React.CSSProperties | undefined {
    return errorField === name ? { borderColor: "#ff6b6b", outline: "1px solid #ff6b6b" } : undefined;
  }

  function handleStatusChange(status: Raid["status"]) {
    if (
      CONFIRMED_TRANSITIONS.includes(status) &&
      !confirm(`${RAID_STATUS_ACTION_LABELS[status]}: ${raid.instance}?`)
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await setRaidStatus(raid.id, status);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Něco se pokazilo.");
      }
    });
  }

  if (editing) {
    return (
      <form ref={formRef} action={handleUpdate} style={{ display: "grid", gap: "0.6rem", maxWidth: 420 }}>
        <label>
          Instance
          <input name="instance" defaultValue={raid.instance} required style={fieldStyle("instance")} />
        </label>
        <label>
          Začátek
          <input
            name="startsAt"
            type="datetime-local"
            defaultValue={toDateTimeLocalValue(raid.startsAt)}
            required
            style={fieldStyle("startsAt")}
          />
        </label>
        <label>
          Konec
          <input
            name="endsAt"
            type="datetime-local"
            defaultValue={toDateTimeLocalValue(raid.endsAt)}
            required
            style={fieldStyle("endsAt")}
          />
        </label>
        <label>
          Signup mode
          <select name="signupMode" defaultValue={raid.signupMode} required style={fieldStyle("signupMode")}>
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
            defaultValue={raid.capacity}
            required
            style={fieldStyle("capacity")}
          />
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
      {canManage && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {isRaidEditable(raid.status) && (
            <button onClick={() => setEditing(true)} disabled={isPending}>
              Upravit raid
            </button>
          )}
          {RAID_STATUS_TRANSITIONS[raid.status].map((target) => (
            <button key={target} onClick={() => handleStatusChange(target)} disabled={isPending}>
              {RAID_STATUS_ACTION_LABELS[target]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
