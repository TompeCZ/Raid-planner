"use client";

import { useState, useTransition } from "react";
import type { Character } from "@/db/schema";
import { createCharacter, setMain, unsetMain, updateCharacter } from "./actions";
import { WOW_CLASSES } from "./constants";

const FACTIONS = ["ALLIANCE", "HORDE"] as const;
const ROLES = ["TANK", "HEALER", "MELEE", "RANGED"] as const;

function deriveValues(character?: Character) {
  return {
    name: character?.name ?? "",
    realm: character?.realm ?? "",
    faction: character?.faction ?? ("ALLIANCE" as (typeof FACTIONS)[number]),
    class: character?.class ?? WOW_CLASSES[0],
    role: character?.role ?? ("TANK" as (typeof ROLES)[number]),
    isRaidReady: character?.isRaidReady ?? false,
    externalUrl: character?.externalUrl ?? "",
    note: character?.note ?? "",
  };
}

type Values = ReturnType<typeof deriveValues>;

export function CharacterForm({
  character,
  onDone,
}: {
  character?: Character;
  onDone?: () => void;
}) {
  // CharacterRow renderuje tuhle komponentu jen podmíněně (`if (editing) return <CharacterForm .../>`),
  // takže při každém otevření editace jde o čerstvý mount — initializer stačí spustit jednou.
  const [values, setValues] = useState<Values>(() => deriveValues(character));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [mainError, setMainError] = useState<string | null>(null);
  const [mainPending, startMainTransition] = useTransition();

  function setField<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function handleToggleMain(checked: boolean) {
    if (!character) return;
    setMainError(null);
    startMainTransition(async () => {
      try {
        if (checked) {
          await setMain(character.id);
        } else {
          await unsetMain(character.id);
        }
      } catch (e) {
        // Neúspěch (druhá hlavní) nechává stav beze změny — checkbox je řízený
        // ze serverového `character.isMain`, takže bez revalidace zůstane, jak byl.
        setMainError(e instanceof Error ? e.message : "Něco se pokazilo.");
      }
    });
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        if (character) {
          await updateCharacter(character.id, formData);
        } else {
          await createCharacter(formData);
          setValues(deriveValues());
        }
        onDone?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Něco se pokazilo.");
      }
    });
  }

  return (
    <form action={handleSubmit} style={{ display: "grid", gap: "0.6rem", maxWidth: 420 }}>
      <label>
        Jméno
        <input name="name" value={values.name} onChange={(e) => setField("name", e.target.value)} required />
      </label>
      <label>
        Realm
        <input
          name="realm"
          value={values.realm}
          onChange={(e) => setField("realm", e.target.value)}
          required
        />
      </label>
      <label>
        Faction
        <select
          name="faction"
          value={values.faction}
          onChange={(e) => setField("faction", e.target.value as Values["faction"])}
          required
        >
          {FACTIONS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>
      <label>
        Class
        <select
          name="class"
          value={values.class}
          onChange={(e) => setField("class", e.target.value)}
          required
        >
          {WOW_CLASSES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label>
        Role
        <select
          name="role"
          value={values.role}
          onChange={(e) => setField("role", e.target.value as Values["role"])}
          required
        >
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
          checked={values.isRaidReady}
          onChange={(e) => setField("isRaidReady", e.target.checked)}
        />{" "}
        Raid ready
      </label>
      {character && (
        <label style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <input
            type="checkbox"
            checked={character.isMain}
            disabled={mainPending}
            onChange={(e) => handleToggleMain(e.target.checked)}
          />
          Hlavní
        </label>
      )}
      {mainError && <p style={{ color: "#ff6b6b" }}>{mainError}</p>}
      <label>
        Odkaz (armory/logs)
        <input
          name="externalUrl"
          type="url"
          value={values.externalUrl}
          onChange={(e) => setField("externalUrl", e.target.value)}
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
