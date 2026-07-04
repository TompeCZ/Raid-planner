"use client";

import { useState, useTransition } from "react";
import type { Character } from "@/db/schema";
import { softDeleteCharacter } from "./actions";
import { CharacterForm } from "./character-form";

export function CharacterRow({ character }: { character: Character }) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (editing) {
    return (
      <li style={{ listStyle: "none", padding: "1rem 0", borderBottom: "1px solid #333" }}>
        <CharacterForm character={character} onDone={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li
      style={{
        listStyle: "none",
        padding: "1rem 0",
        borderBottom: "1px solid #333",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "1rem",
      }}
    >
      <div>
        <strong>{character.name}</strong>{" "}
        {character.isMain && (
          <span
            style={{
              fontSize: "0.7rem",
              padding: "0.1rem 0.4rem",
              border: "1px solid #4ea1ff",
              borderRadius: 4,
            }}
          >
            hlavní
          </span>
        )}{" "}
        — {character.realm} ({character.faction})
        <div style={{ fontSize: "0.9rem", opacity: 0.8 }}>
          {character.class} · {character.role}
          {character.isRaidReady ? " · raid ready" : ""}
        </div>
        {character.externalUrl && (
          <div style={{ fontSize: "0.85rem" }}>
            <a href={character.externalUrl} target="_blank" rel="noreferrer">
              {character.externalUrl}
            </a>
          </div>
        )}
        {character.note && <div style={{ fontSize: "0.85rem", opacity: 0.7 }}>{character.note}</div>}
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
        <button onClick={() => setEditing(true)}>Upravit</button>
        <button
          disabled={isPending}
          onClick={() => {
            if (!confirm(`Smazat postavu ${character.name}?`)) return;
            startTransition(async () => {
              await softDeleteCharacter(character.id);
            });
          }}
        >
          Smazat
        </button>
      </div>
    </li>
  );
}
