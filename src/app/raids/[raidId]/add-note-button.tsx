"use client";

import { useState, useTransition } from "react";
import { createNote, type NoteCategoryValue, type NoteSentimentValue, type NoteVisibilityValue } from "@/app/roster/actions";

const CATEGORIES: NoteCategoryValue[] = ["PERFORMANCE", "BEHAVIOR", "ATTENDANCE", "LOOT", "RECRUITMENT", "OTHER"];
const SENTIMENTS: NoteSentimentValue[] = ["POSITIVE", "NEUTRAL", "CONCERN"];

type Props = {
  subjectUserId: string;
  raidId: string;
  characters: { id: string; name: string }[];
};

/**
 * Kontextové psaní poznámky přímo z detailu raidu — raidId je předvyplněný
 * a needitovatelný (na rozdíl od plného formuláře na dossieru). Postava se
 * liší podle počtu: 0 → bez postavy (žádný select), 1 → napevno předvyplněná
 * (žádný select, jen text), 2+ → select s volbou "— bez postavy —" jako
 * default. Nikdy needitovatelně tiše nevybírej první postavu z pole — u
 * ALL-pool signupu s víc postavami by to bylo fakticky náhodné přilepení
 * poznámky k jiné postavě, než o které RL psal; poznámka bez postavy je
 * platná a lepší odpověď, než hádat.
 */
export function AddNoteButton({ subjectUserId, raidId, characters }: Props) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<NoteCategoryValue>("OTHER");
  const [sentiment, setSentiment] = useState<NoteSentimentValue>("NEUTRAL");
  const [visibility, setVisibility] = useState<NoteVisibilityValue>("LEADERSHIP");
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={{ fontSize: "0.75rem" }}>
        Přidat poznámku
      </button>
    );
  }

  const fixedCharacter = characters.length === 1 ? characters[0] : null;

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      try {
        await createNote({
          subjectUserId,
          raidId,
          characterId: fixedCharacter ? fixedCharacter.id : selectedCharacterId || null,
          category,
          sentiment,
          visibility,
          body,
        });
        setBody("");
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Něco se pokazilo.");
      }
    });
  }

  return (
    <span
      style={{
        display: "inline-flex",
        flexDirection: "column",
        gap: "0.3rem",
        border: "1px solid #333",
        borderRadius: 6,
        padding: "0.4rem",
        marginTop: "0.3rem",
      }}
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="Poznámka…"
        style={{ minWidth: 220 }}
      />
      {fixedCharacter && <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>Postava: {fixedCharacter.name}</span>}
      {!fixedCharacter && characters.length > 1 && (
        <select value={selectedCharacterId} onChange={(e) => setSelectedCharacterId(e.target.value)}>
          <option value="">— bez postavy —</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <span style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
        <select value={category} onChange={(e) => setCategory(e.target.value as NoteCategoryValue)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={sentiment} onChange={(e) => setSentiment(e.target.value as NoteSentimentValue)}>
          {SENTIMENTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={visibility} onChange={(e) => setVisibility(e.target.value as NoteVisibilityValue)}>
          <option value="LEADERSHIP">Vedení</option>
          <option value="PRIVATE">Soukromá</option>
        </select>
      </span>
      {error && <span style={{ color: "#ff6b6b", fontSize: "0.75rem" }}>{error}</span>}
      <span style={{ display: "flex", gap: "0.3rem" }}>
        <button type="button" onClick={handleSubmit} disabled={isPending || !body.trim()}>
          Uložit
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={isPending}>
          Zrušit
        </button>
      </span>
    </span>
  );
}
