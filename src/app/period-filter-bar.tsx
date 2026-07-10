"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PeriodFilter } from "@/lib/period-filter";

type Props = {
  basePath: string;
  filter: PeriodFilter;
};

/**
 * Filtr období sdílený mezi guild žebříčkem (`/stats`) a profilem hráče
 * (`/players/[userId]`) — presety (poslední měsíc / vše) jako obyčejné
 * odkazy, vlastní rozsah přes `router.push` sestavený z inputů.
 */
export function PeriodFilterBar({ basePath, filter }: Props) {
  const router = useRouter();
  const [from, setFrom] = useState(filter.fromKey ?? "");
  const [to, setTo] = useState(filter.toKey ?? "");

  function applyCustom() {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    router.push(qs.toString() ? `${basePath}?${qs}` : basePath);
  }

  return (
    <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", margin: "0.75rem 0 1rem" }}>
      <Link href={basePath} style={{ fontWeight: filter.preset === "lastMonth" ? "bold" : "normal" }}>
        Poslední měsíc
      </Link>
      <Link href={`${basePath}?range=all`} style={{ fontWeight: filter.preset === "all" ? "bold" : "normal" }}>
        Vše
      </Link>
      <span style={{ display: "flex", gap: "0.35rem", alignItems: "center", fontSize: "0.85rem" }}>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        {"–"}
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <button type="button" onClick={applyCustom}>
          Vlastní období
        </button>
      </span>
      {filter.preset === "custom" && (
        <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>
          {filter.fromKey ?? "…"} – {filter.toKey ?? "…"}
        </span>
      )}
    </div>
  );
}
