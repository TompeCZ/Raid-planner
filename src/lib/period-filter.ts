/**
 * Sdílený parser filtru období pro statistiky (guild žebříček + profil hráče).
 * Čistý — bez DB — ať ho jde importovat odkudkoli. URL kontrakt:
 *   (bez parametrů)         -> poslední měsíc (from = dnes − 1 měsíc)
 *   ?range=all               -> bez omezení
 *   ?from=YYYY-MM-DD&to=...  -> vlastní rozsah (obě meze inkluzivní)
 */
import { pragueDateKeyMinusMonths } from "./local-date";

export type PeriodPreset = "lastMonth" | "all" | "custom";

export type PeriodFilter = {
  /** Pražský den-klíč, inkluzivní dolní mez, nebo null = bez omezení. */
  fromKey: string | null;
  /** Pražský den-klíč, inkluzivní horní mez, nebo null = bez omezení. */
  toKey: string | null;
  preset: PeriodPreset;
};

export type PeriodFilterParams = { range?: string; from?: string; to?: string };

export function parsePeriodFilter(params: PeriodFilterParams, now: Date = new Date()): PeriodFilter {
  if (params.range === "all") {
    return { fromKey: null, toKey: null, preset: "all" };
  }
  if (params.from || params.to) {
    return { fromKey: params.from ?? null, toKey: params.to ?? null, preset: "custom" };
  }
  return { fromKey: pragueDateKeyMinusMonths(now, 1), toKey: null, preset: "lastMonth" };
}

/** `dateKey` (YYYY-MM-DD) uvnitř filtru — obě meze inkluzivní, řetězcové porovnání funguje díky ISO formátu. */
export function isWithinPeriod(dateKey: string, filter: PeriodFilter): boolean {
  if (filter.fromKey && dateKey < filter.fromKey) return false;
  if (filter.toKey && dateKey > filter.toKey) return false;
  return true;
}
