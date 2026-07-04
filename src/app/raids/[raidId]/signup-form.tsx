"use client";

import { useState, useTransition } from "react";
import type { Character } from "@/db/schema";
import { submitSignup, withdrawSignup } from "./actions";

const STATUSES = ["YES", "LATE", "TENTATIVE", "ABSENT"] as const;

export function SignupForm({
  raidId,
  signupMode,
  characters,
  initialStatus,
  initialCharacterIds,
  hasExistingSignup,
}: {
  raidId: string;
  signupMode: "ALL" | "SINGLE";
  characters: Character[];
  initialStatus?: (typeof STATUSES)[number];
  initialCharacterIds: string[];
  hasExistingSignup: boolean;
}) {
  const [status, setStatus] = useState<(typeof STATUSES)[number]>(initialStatus ?? "YES");
  const [selected, setSelected] = useState<string[]>(() => {
    if (initialCharacterIds.length > 0) return initialCharacterIds;
    // Nový signup v ALL módu: pool předvyplněný všemi ready postavami (může odškrtnout).
    return signupMode === "ALL" ? characters.map((c) => c.id) : [];
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const showCharacterPool = status !== "ABSENT";

  function toggleCharacter(id: string) {
    if (signupMode === "SINGLE") {
      setSelected([id]);
      return;
    }
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await submitSignup(raidId, formData);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Něco se pokazilo.");
      }
    });
  }

  function handleWithdraw() {
    if (!confirm("Zrušit signup na tento raid?")) return;
    setError(null);
    startTransition(async () => {
      try {
        await withdrawSignup(raidId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Něco se pokazilo.");
      }
    });
  }

  if (characters.length === 0) {
    return <p>Nemáš žádnou raid-ready postavu — přidej si ji na stránce postav.</p>;
  }

  return (
    <form action={handleSubmit} style={{ display: "grid", gap: "0.6rem", maxWidth: 420 }}>
      <label>
        Status
        <select
          name="status"
          value={status}
          onChange={(e) => setStatus(e.target.value as (typeof STATUSES)[number])}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      {showCharacterPool && (
        <fieldset>
          <legend>
            {signupMode === "ALL" ? "Postavy (odškrtni ty, které nechceš)" : "Vyber jednu postavu"}
          </legend>
          {characters.map((c) => (
            <label key={c.id} style={{ display: "block" }}>
              <input
                type={signupMode === "SINGLE" ? "radio" : "checkbox"}
                name="characterIds"
                value={c.id}
                checked={selected.includes(c.id)}
                onChange={() => toggleCharacter(c.id)}
              />{" "}
              {c.name} ({c.role})
            </label>
          ))}
        </fieldset>
      )}

      {error && <p style={{ color: "#ff6b6b" }}>{error}</p>}

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button type="submit" disabled={isPending}>
          {hasExistingSignup ? "Uložit signup" : "Přihlásit se"}
        </button>
        {hasExistingSignup && (
          <button type="button" onClick={handleWithdraw} disabled={isPending}>
            Zrušit signup
          </button>
        )}
      </div>
    </form>
  );
}
