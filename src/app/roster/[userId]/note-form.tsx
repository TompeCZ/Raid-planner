"use client";

import { useState, useTransition } from "react";
import { createNote, type NoteCategoryValue, type NoteSentimentValue, type NoteVisibilityValue } from "../actions";
import type { DossierCharacterOption, DossierRaidOption } from "./actions";

const CATEGORIES: NoteCategoryValue[] = ["PERFORMANCE", "BEHAVIOR", "ATTENDANCE", "LOOT", "RECRUITMENT", "OTHER"];
const SENTIMENTS: NoteSentimentValue[] = ["POSITIVE", "NEUTRAL", "CONCERN"];

function formatRaidOption(r: DossierRaidOption): string {
  return `${r.instance} — ${new Date(r.startsAt).toLocaleDateString("cs-CZ")}`;
}

type Props = {
  subjectUserId: string;
  characterOptions: DossierCharacterOption[];
  raidOptions: DossierRaidOption[];
};

export function NoteForm({ subjectUserId, characterOptions, raidOptions }: Props) {
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<NoteCategoryValue>("OTHER");
  const [sentiment, setSentiment] = useState<NoteSentimentValue>("NEUTRAL");
  const [visibility, setVisibility] = useState<NoteVisibilityValue>("LEADERSHIP");
  const [characterId, setCharacterId] = useState("");
  const [raidId, setRaidId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      try {
        await createNote({
          subjectUserId,
          characterId: characterId || null,
          raidId: raidId || null,
          category,
          sentiment,
          visibility,
          body,
        });
        setBody("");
        setCategory("OTHER");
        setSentiment("NEUTRAL");
        setVisibility("LEADERSHIP");
        setCharacterId("");
        setRaidId("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Něco se pokazilo.");
      }
    });
  }

  return (
    <div
      style={{
        border: "1px solid #333",
        borderRadius: 6,
        padding: "0.75rem",
        margin: "0.75rem 0 1.25rem",
        display: "grid",
        gap: "0.5rem",
      }}
    >
      <textarea
        placeholder="Nová poznámka…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        style={{ width: "100%" }}
      />
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <label>
          Kategorie{" "}
          <select value={category} onChange={(e) => setCategory(e.target.value as NoteCategoryValue)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sentiment{" "}
          <select value={sentiment} onChange={(e) => setSentiment(e.target.value as NoteSentimentValue)}>
            {SENTIMENTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Viditelnost{" "}
          <select value={visibility} onChange={(e) => setVisibility(e.target.value as NoteVisibilityValue)}>
            <option value="LEADERSHIP">Vedení</option>
            <option value="PRIVATE">Soukromá (vidíš jen ty)</option>
          </select>
        </label>
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <label>
          Postava (volitelně){" "}
          <select value={characterId} onChange={(e) => setCharacterId(e.target.value)}>
            <option value="">—</option>
            {characterOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Raid (volitelně){" "}
          <select value={raidId} onChange={(e) => setRaidId(e.target.value)}>
            <option value="">—</option>
            {raidOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {formatRaidOption(r)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p style={{ color: "#ff6b6b" }}>{error}</p>}
      <div>
        <button type="button" onClick={handleSubmit} disabled={isPending || !body.trim()}>
          Přidat poznámku
        </button>
      </div>
    </div>
  );
}
