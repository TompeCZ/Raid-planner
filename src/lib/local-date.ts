const PRAGUE_TZ = "Europe/Prague";

/**
 * Wall-clock datum (YYYY-MM-DD) v Europe/Prague pro daný okamžik. Používej
 * VŽDY místo `date.toISOString().slice(0,10)` — večerní raid uložený v UTC by
 * jinak mohl spadnout na špatný (dřívější) den, protože Praha je UTC+1/+2.
 */
export function toPragueDateKey(date: Date): string {
  // en-CA formátuje jako YYYY-MM-DD, žádné ruční skládání dílů.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PRAGUE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

const RAID_DATETIME_FORMAT = new Intl.DateTimeFormat("cs-CZ", {
  weekday: "short",
  day: "numeric",
  month: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: PRAGUE_TZ,
});

/** Datum+čas raidu pro Discord zprávy (oznámení, setup embed) — lokální Europe/Prague, lidsky čitelné. */
export function formatRaidDateTimeLabel(date: Date): string {
  return RAID_DATETIME_FORMAT.format(date);
}

/**
 * Datum-klíč `days` dní od pražského kalendářního dne, ve kterém leží `from`.
 * Kotví na poledni UTC toho dne (bezpečně uvnitř pražského dne bez ohledu na
 * DST offset), pak přičte dny a znovu zformátuje — sčítání dní tak nikdy
 * nesklouzne o den vedle kvůli přechodu na letní/zimní čas.
 */
export function pragueDateKeyPlusDays(from: Date, days: number): string {
  const [y, m, d] = toPragueDateKey(from).split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return toPragueDateKey(anchor);
}

/**
 * Pražský den-klíč přesně `months` měsíců zpět od `from`. Pozor: `Date` den
 * NEořízne, pokud cílový měsíc nemá tolik dní — přeteče do dalšího měsíce
 * (31. květen − 1 měsíc = 1. květen, ne 30. duben). Stejná kotva na poledne
 * UTC jako `pragueDateKeyPlusDays`, bezpečná vůči DST.
 */
export function pragueDateKeyMinusMonths(from: Date, months: number): string {
  const [y, m, d] = toPragueDateKey(from).split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1 - months, d, 12, 0, 0));
  return toPragueDateKey(anchor);
}
