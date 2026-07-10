import { describe, expect, it } from "vitest";
import { isWithinPeriod, parsePeriodFilter } from "./period-filter";

const NOW = new Date("2026-07-10T12:00:00Z");

describe("parsePeriodFilter", () => {
  it("bez parametrů dá poslední měsíc (from = dnes - 1 měsíc, to bez omezení)", () => {
    expect(parsePeriodFilter({}, NOW)).toEqual({ fromKey: "2026-06-10", toKey: null, preset: "lastMonth" });
  });

  it("range=all zruší obě meze", () => {
    expect(parsePeriodFilter({ range: "all" }, NOW)).toEqual({ fromKey: null, toKey: null, preset: "all" });
  });

  it("vlastní from/to se propíší beze změny", () => {
    expect(parsePeriodFilter({ from: "2026-01-01", to: "2026-03-31" }, NOW)).toEqual({
      fromKey: "2026-01-01",
      toKey: "2026-03-31",
      preset: "custom",
    });
  });

  it("jen from bez to je taky custom, horní mez zůstává neomezená", () => {
    expect(parsePeriodFilter({ from: "2026-01-01" }, NOW)).toEqual({
      fromKey: "2026-01-01",
      toKey: null,
      preset: "custom",
    });
  });

  it("range=all má přednost i kdyby přišly from/to", () => {
    expect(parsePeriodFilter({ range: "all", from: "2026-01-01" }, NOW)).toEqual({
      fromKey: null,
      toKey: null,
      preset: "all",
    });
  });
});

describe("isWithinPeriod", () => {
  it("obě meze jsou inkluzivní", () => {
    const filter = { fromKey: "2026-06-01", toKey: "2026-06-30", preset: "custom" as const };
    expect(isWithinPeriod("2026-06-01", filter)).toBe(true);
    expect(isWithinPeriod("2026-06-30", filter)).toBe(true);
    expect(isWithinPeriod("2026-05-31", filter)).toBe(false);
    expect(isWithinPeriod("2026-07-01", filter)).toBe(false);
  });

  it("bez mezí (preset all) projde cokoli", () => {
    const filter = { fromKey: null, toKey: null, preset: "all" as const };
    expect(isWithinPeriod("1999-01-01", filter)).toBe(true);
  });
});
