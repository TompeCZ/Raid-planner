"use client";

import { useRef, useState, useTransition } from "react";
import type { Character } from "@/db/schema";
import { createCharacter, updateCharacter } from "./actions";
import { WOW_CLASSES } from "./constants";

const FACTIONS = ["ALLIANCE", "HORDE"] as const;
const ROLES = ["TANK", "HEALER", "MELEE", "RANGED"] as const;

export function CharacterForm({
  character,
  onDone,
}: {
  character?: Character;
  onDone?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        if (character) {
          await updateCharacter(character.id, formData);
        } else {
          await createCharacter(formData);
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
        Jméno
        <input name="name" defaultValue={character?.name} required />
      </label>
      <label>
        Realm
        <input name="realm" defaultValue={character?.realm} required />
      </label>
      <label>
        Faction
        <select name="faction" defaultValue={character?.faction ?? "ALLIANCE"} required>
          {FACTIONS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>
      <label>
        Class
        <select name="class" defaultValue={character?.class ?? WOW_CLASSES[0]} required>
          {WOW_CLASSES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label>
        Role
        <select name="role" defaultValue={character?.role ?? "TANK"} required>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          name="isRaidReady"
          defaultChecked={character?.isRaidReady ?? false}
        />{" "}
        Raid ready
      </label>
      <label>
        Odkaz (armory/logs)
        <input name="externalUrl" type="url" defaultValue={character?.externalUrl ?? ""} />
      </label>
      <label>
        Poznámka
        <textarea name="note" defaultValue={character?.note ?? ""} rows={2} />
      </label>

      {error && <p style={{ color: "#ff6b6b" }}>{error}</p>}

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button type="submit" disabled={isPending}>
          {character ? "Uložit" : "Přidat postavu"}
        </button>
        {character && (
          <button type="button" onClick={onDone} disabled={isPending}>
            Zrušit
          </button>
        )}
      </div>
    </form>
  );
}
