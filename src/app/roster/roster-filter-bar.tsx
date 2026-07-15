"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PeriodFilter } from "@/lib/period-filter";
import { GUILD_RANK_ORDER } from "@/lib/notes-visibility";

const NOTE_CATEGORIES = ["PERFORMANCE", "BEHAVIOR", "ATTENDANCE", "LOOT", "RECRUITMENT", "OTHER"] as const;

export type RosterExtraFilters = { rank?: string; sentiment?: string; category?: string };

type Props = {
  periodFilter: PeriodFilter;
  extraFilters: RosterExtraFilters;
};

/**
 * Filtr pro /roster — období + rank/kategorie/concern v jedné querystringu.
 * Samostatná komponenta, ne `@/app/period-filter-bar` (ten sdílí `/stats` a
 * `/players/[userId]` — hard rule zakazuje na ty routy/sdílené soubory sahat,
 * i kdyby to bylo jen rozšíření o pár props).
 */
export function RosterFilterBar({ periodFilter, extraFilters }: Props) {
  const router = useRouter();
  const [from, setFrom] = useState(periodFilter.fromKey ?? "");
  const [to, setTo] = useState(periodFilter.toKey ?? "");
  const [rank, setRank] = useState(extraFilters.rank ?? "");
  const [category, setCategory] = useState(extraFilters.category ?? "");
  const [onlyConcern, setOnlyConcern] = useState(extraFilters.sentiment === "CONCERN");

  function navigate(opts: { range?: "all"; from?: string; to?: string }) {
    const qs = new URLSearchParams();
    if (opts.range) qs.set("range", opts.range);
    else {
      if (opts.from) qs.set("from", opts.from);
      if (opts.to) qs.set("to", opts.to);
    }
    if (rank) qs.set("rank", rank);
    if (category) qs.set("category", category);
    if (onlyConcern) qs.set("sentiment", "CONCERN");
    const s = qs.toString();
    router.push(s ? `/roster?${s}` : "/roster");
  }

  return (
    <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", margin: "0.75rem 0 1rem", fontSize: "0.85rem" }}>
      <button
        type="button"
        onClick={() => navigate({})}
        style={{ fontWeight: periodFilter.preset === "lastMonth" ? "bold" : "normal" }}
      >
        Poslední měsíc
      </button>
      <button
        type="button"
        onClick={() => navigate({ range: "all" })}
        style={{ fontWeight: periodFilter.preset === "all" ? "bold" : "normal" }}
      >
        Vše
      </button>
      <span style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        {"–"}
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </span>

      <select value={rank} onChange={(e) => setRank(e.target.value)}>
        <option value="">Všechny ranky</option>
        {GUILD_RANK_ORDER.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>

      <select value={category} onChange={(e) => setCategory(e.target.value)}>
        <option value="">Všechny kategorie</option>
        {NOTE_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <label>
        <input type="checkbox" checked={onlyConcern} onChange={(e) => setOnlyConcern(e.target.checked)} /> Jen otevřené
        concerns (za zvolené období)
      </label>

      <button type="button" onClick={() => navigate({ from, to })}>
        Použít filtr
      </button>
    </div>
  );
}
