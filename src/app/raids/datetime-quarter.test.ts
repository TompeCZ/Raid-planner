import { describe, expect, it } from "vitest";
import { joinDateTimeQuarter, splitDateTimeQuarter } from "./datetime-quarter";

describe("splitDateTimeQuarter", () => {
  it("prázdná hodnota dostane rozumné defaulty a prázdné datum", () => {
    expect(splitDateTimeQuarter("")).toEqual({ date: "", hour: "20", minute: "00" });
  });

  it("rozloží plnou hodnotu na datum/hodinu/minutu", () => {
    expect(splitDateTimeQuarter("2026-07-14T18:30")).toEqual({
      date: "2026-07-14",
      hour: "18",
      minute: "30",
    });
  });

  it("hodnotu s minutou mimo čtvrthodinu (starší data) NEsnapuje, vrátí ji beze změny", () => {
    expect(splitDateTimeQuarter("2026-07-14T18:41")).toEqual({
      date: "2026-07-14",
      hour: "18",
      minute: "41",
    });
  });

  it("prázdná hodnota respektuje per-instance default hodinu (raid-form: 19 pro začátek, 22 pro konec)", () => {
    expect(splitDateTimeQuarter("", { hour: "19" })).toEqual({ date: "", hour: "19", minute: "00" });
    expect(splitDateTimeQuarter("", { hour: "22" })).toEqual({ date: "", hour: "22", minute: "00" });
  });

  it("existující hodnota má přednost před defaultem", () => {
    expect(splitDateTimeQuarter("2026-07-14T18:30", { hour: "19" })).toEqual({
      date: "2026-07-14",
      hour: "18",
      minute: "30",
    });
  });
});

describe("joinDateTimeQuarter", () => {
  it("poskládá zpátky do YYYY-MM-DDTHH:mm", () => {
    expect(joinDateTimeQuarter("2026-07-14", "18", "30")).toBe("2026-07-14T18:30");
  });

  it("bez data vrátí prázdný řetězec", () => {
    expect(joinDateTimeQuarter("", "18", "30")).toBe("");
  });
});
