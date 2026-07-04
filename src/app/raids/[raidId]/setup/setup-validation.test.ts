import { describe, expect, it } from "vitest";
import { assertValidGroupNo, assertValidSlotNo, GROUP_COUNT, SLOTS_PER_GROUP } from "./setup-validation";

describe("assertValidGroupNo", () => {
  it("přijme 1 až GROUP_COUNT", () => {
    for (let g = 1; g <= GROUP_COUNT; g++) {
      expect(() => assertValidGroupNo(g)).not.toThrow();
    }
  });

  it("odmítne 0, záporné, necelé a nad GROUP_COUNT", () => {
    for (const g of [0, -1, 1.5, GROUP_COUNT + 1, 99]) {
      expect(() => assertValidGroupNo(g)).toThrow(`Skupina musí být 1–${GROUP_COUNT}.`);
    }
  });

  it("40man = 8 skupin x 5 slotů", () => {
    expect(GROUP_COUNT * SLOTS_PER_GROUP).toBe(40);
  });
});

describe("assertValidSlotNo", () => {
  it("přijme 1 až SLOTS_PER_GROUP", () => {
    for (let s = 1; s <= SLOTS_PER_GROUP; s++) {
      expect(() => assertValidSlotNo(s)).not.toThrow();
    }
  });

  it("odmítne 0, záporné, necelé a nad SLOTS_PER_GROUP", () => {
    for (const s of [0, -1, 2.5, SLOTS_PER_GROUP + 1, 99]) {
      expect(() => assertValidSlotNo(s)).toThrow(`Slot musí být 1–${SLOTS_PER_GROUP}.`);
    }
  });
});
