"use client";

import { useState, useTransition } from "react";
import type { CSSProperties } from "react";
import type { Raid } from "@/db/schema";
import { announceRaidToDiscord, updateRaid, setRaidStatus } from "./actions";
import { fieldForRaidFormError } from "../raid-validation";
import { DateTimeQuarterInput } from "../datetime-quarter-input";
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

function deriveValues(raid: Raid) {
  return {
    instance: raid.instance,
    startsAt: toDateTimeLocalValue(raid.startsAt),
    endsAt: toDateTimeLocalValue(raid.endsAt),
    signupMode: raid.signupMode,
    capacity: String(raid.capacity),
    notes: raid.notes ?? "",
  };
}

type Values = ReturnType<typeof deriveValues>;

export function RaidHeader({ raid, canManage }: { raid: Raid; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Values>(() => deriveValues(raid));
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [discordResult, setDiscordResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isAnnouncing, startAnnounceTransition] = useTransition();

  function setField<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function openEditing() {
    // Přenačte formulář z aktuálního raidu — component neremountuje, takže bez
    // tohohle by se po předchozí úpravě/zrušení zobrazila stará rozpracovaná data.
    setValues(deriveValues(raid));
    setError(null);
    setErrorField(null);
    setEditing(true);
  }

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
      }
    });
  }

  function fieldStyle(name: string): CSSProperties | undefined {
    return errorField === name ? { borderColor: "#ff6b6b", outline: "1px solid #ff6b6b" } : undefined;
  }

  function handleAnnounce() {
    setDiscordResult(null);
    startAnnounceTransition(async () => {
      const result = await announceRaidToDiscord(raid.id);
      setDiscordResult({
        ok: result.ok,
        message: result.ok ? "Oznámení odesláno na Discord." : (result.error ?? "Něco se pokazilo."),
      });
    });
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
      <form action={handleUpdate} style={{ display: "grid", gap: "0.6rem", maxWidth: 420 }}>
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
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          {isRaidEditable(raid.status) && (
            <button onClick={openEditing} disabled={isPending}>
              Upravit raid
            </button>
          )}
          {RAID_STATUS_TRANSITIONS[raid.status].map((target) => (
            <button key={target} onClick={() => handleStatusChange(target)} disabled={isPending}>
              {RAID_STATUS_ACTION_LABELS[target]}
            </button>
          ))}
          {raid.status !== "DRAFT" && (
            <button onClick={handleAnnounce} disabled={isAnnouncing}>
              Oznámit na Discord
            </button>
          )}
          {discordResult && (
            <span style={{ fontSize: "0.85rem", color: discordResult.ok ? "#4ea1ff" : "#ff6b6b" }}>
              {discordResult.message}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
