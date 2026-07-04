export type IcalRaidEvent = {
  id: string;
  instance: string;
  startsAt: Date;
  endsAt: Date;
};

/** RFC5545 text escaping — pořadí je důležité: zpětné lomítko nejdřív, jinak by se dvakrát escapovaly nově přidané escape znaky. */
export function escapeIcalText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** UTC Date -> `YYYYMMDDTHHMMSSZ` (RFC5545 DATE-TIME v UTC). */
export function formatIcalDateUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function buildVEvent(raidEvent: IcalRaidEvent, dtstamp: Date): string {
  return [
    "BEGIN:VEVENT",
    `UID:${raidEvent.id}`,
    `DTSTAMP:${formatIcalDateUtc(dtstamp)}`,
    `DTSTART:${formatIcalDateUtc(raidEvent.startsAt)}`,
    `DTEND:${formatIcalDateUtc(raidEvent.endsAt)}`,
    `SUMMARY:${escapeIcalText(raidEvent.instance)}`,
    "END:VEVENT",
  ].join("\r\n");
}

/** Kompletní VCALENDAR feed — jen raidy (žádné absence), viz calendar/[token] route. */
export function buildVCalendar(raids: IcalRaidEvent[], dtstamp: Date = new Date()): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Raid Planner//Calendar Feed//CS",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Raid Planner",
    ...raids.map((r) => buildVEvent(r, dtstamp)),
    "END:VCALENDAR",
  ].join("\r\n");
}
