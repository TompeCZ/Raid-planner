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
