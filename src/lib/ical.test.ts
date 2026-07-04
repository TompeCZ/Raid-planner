import { describe, expect, it } from "vitest";
import { buildVCalendar, buildVEvent, escapeIcalText, formatIcalDateUtc } from "./ical";

describe("formatIcalDateUtc", () => {
  it("formátuje UTC Date na YYYYMMDDTHHMMSSZ", () => {
    expect(formatIcalDateUtc(new Date("2026-07-06T17:30:00.000Z"))).toBe("20260706T173000Z");
  });
});

describe("escapeIcalText", () => {
  it("escapuje čárku, středník, newline a zpětné lomítko", () => {
    expect(escapeIcalText("a,b;c\nd\\e")).toBe("a\\,b\\;c\\nd\\\\e");
  });

  it("zpětné lomítko se escapuje jako první — nově přidané escapy se znovu neescapují", () => {
    expect(escapeIcalText("a;b")).toBe("a\\;b");
    expect(escapeIcalText("a\\;b")).toBe("a\\\\\\;b");
  });
});

describe("buildVEvent", () => {
  it("vygeneruje VEVENT se všemi požadovanými poli", () => {
    const dtstamp = new Date("2026-07-01T00:00:00.000Z");
    const event = buildVEvent(
      { id: "raid-123", instance: "Karazhan", startsAt: new Date("2026-07-06T17:00:00.000Z"), endsAt: new Date("2026-07-06T20:00:00.000Z") },
      dtstamp,
    );
    const lines = event.split("\r\n");
    expect(lines[0]).toBe("BEGIN:VEVENT");
    expect(lines).toContain("UID:raid-123");
    expect(lines).toContain("DTSTAMP:20260701T000000Z");
    expect(lines).toContain("DTSTART:20260706T170000Z");
    expect(lines).toContain("DTEND:20260706T200000Z");
    expect(lines).toContain("SUMMARY:Karazhan");
    expect(lines[lines.length - 1]).toBe("END:VEVENT");
  });

  it("escapuje SUMMARY obsahující čárku/středník", () => {
    const event = buildVEvent(
      { id: "raid-1", instance: "Zul'Gurub, Speedrun; Bonus", startsAt: new Date(), endsAt: new Date() },
      new Date(),
    );
    expect(event).toContain("SUMMARY:Zul'Gurub\\, Speedrun\\; Bonus");
  });
});

describe("buildVCalendar", () => {
  it("obsahuje hlavičku s X-WR-CALNAME a obalí VEVENTy", () => {
    const dtstamp = new Date("2026-07-01T00:00:00.000Z");
    const cal = buildVCalendar(
      [
        { id: "r1", instance: "TK", startsAt: new Date("2026-07-06T17:00:00Z"), endsAt: new Date("2026-07-06T20:00:00Z") },
        { id: "r2", instance: "SSC", startsAt: new Date("2026-07-07T17:00:00Z"), endsAt: new Date("2026-07-07T20:00:00Z") },
      ],
      dtstamp,
    );

    expect(cal.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(cal.endsWith("END:VCALENDAR")).toBe(true);
    expect(cal).toContain("X-WR-CALNAME:Raid Planner");
    expect(cal).toContain("VERSION:2.0");
    expect(cal).toContain("UID:r1");
    expect(cal).toContain("UID:r2");
    expect((cal.match(/BEGIN:VEVENT/g) ?? []).length).toBe(2);
  });

  it("prázdný seznam raidů dá validní prázdný kalendář", () => {
    const cal = buildVCalendar([]);
    expect(cal).toContain("BEGIN:VCALENDAR");
    expect(cal).toContain("END:VCALENDAR");
    expect(cal).not.toContain("BEGIN:VEVENT");
  });
});
