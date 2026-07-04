import { describe, expect, it } from "vitest";
import { assertValidGroupNo, GROUP_COUNT, SLOTS_PER_GROUP } from "./setup-validation";

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
