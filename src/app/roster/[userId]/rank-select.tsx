"use client";

import { useState, useTransition } from "react";
import { setGuildRank, type GuildRankValue } from "../actions";
import { GUILD_RANK_ORDER } from "@/lib/notes-visibility";

/** Okamžitý zápis přes setGuildRank při každé změně — kdokoli z vedení. */
export function RankSelect({ userId, initialRank }: { userId: string; initialRank: GuildRankValue | null }) {
  const [rank, setRank] = useState<GuildRankValue | "">(initialRank ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(value: string) {
    const next = (value || null) as GuildRankValue | null;
    setRank((next ?? "") as GuildRankValue | "");
    setError(null);
    startTransition(async () => {
      try {
        await setGuildRank({ userId, guildRank: next });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Něco se pokazilo.");
      }
    });
  }

  return (
    <span>
      <select value={rank} onChange={(e) => handleChange(e.target.value)} disabled={isPending}>
        <option value="">— (nenastaveno)</option>
        {GUILD_RANK_ORDER.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      {error && <span style={{ color: "#ff6b6b", marginLeft: "0.5rem", fontSize: "0.85rem" }}>{error}</span>}
    </span>
  );
}
