import { describe, expect, it } from "vitest";
import {
  RAID_STATUS_TRANSITIONS,
  RAID_STATUS_ACTION_LABELS,
  canTransitionRaidStatus,
  isRaidEditable,
} from "./raid-status";

describe("canTransitionRaidStatus", () => {
  it("OPEN lze uzamknout, dokončit i zrušit", () => {
    expect(canTransitionRaidStatus("OPEN", "LOCKED")).toBe(true);
    expect(canTransitionRaidStatus("OPEN", "DONE")).toBe(true);
    expect(canTransitionRaidStatus("OPEN", "CANCELLED")).toBe(true);
  });

  it("LOCKED lze znovu otevřít, dokončit i zrušit", () => {
    expect(canTransitionRaidStatus("LOCKED", "OPEN")).toBe(true);
    expect(canTransitionRaidStatus("LOCKED", "DONE")).toBe(true);
    expect(canTransitionRaidStatus("LOCKED", "CANCELLED")).toBe(true);
  });

  it("DONE a CANCELLED jsou koncové stavy", () => {
    for (const target of ["DRAFT", "OPEN", "LOCKED", "DONE", "CANCELLED"] as const) {
      expect(canTransitionRaidStatus("DONE", target)).toBe(false);
      expect(canTransitionRaidStatus("CANCELLED", target)).toBe(false);
    }
  });

  it("OPEN nelze vrátit do DRAFT ani přejít sám na sebe", () => {
    expect(canTransitionRaidStatus("OPEN", "DRAFT")).toBe(false);
    expect(canTransitionRaidStatus("OPEN", "OPEN")).toBe(false);
  });

  it("každý nekoncový přechod má popisek tlačítka", () => {
    for (const targets of Object.values(RAID_STATUS_TRANSITIONS)) {
      for (const target of targets) {
        expect(RAID_STATUS_ACTION_LABELS[target]).toBeTruthy();
      }
    }
  });
});

describe("isRaidEditable", () => {
  it("editovat lze DRAFT/OPEN/LOCKED, koncové stavy ne", () => {
    expect(isRaidEditable("DRAFT")).toBe(true);
    expect(isRaidEditable("OPEN")).toBe(true);
    expect(isRaidEditable("LOCKED")).toBe(true);
    expect(isRaidEditable("DONE")).toBe(false);
    expect(isRaidEditable("CANCELLED")).toBe(false);
  });
});
