import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emojiFor } from "./discord-emoji";

describe("emojiFor", () => {
  const originalWarrior = process.env.DISCORD_EMOJI_WARRIOR;

  beforeEach(() => {
    delete process.env.DISCORD_EMOJI_WARRIOR;
  });

  afterEach(() => {
    if (originalWarrior === undefined) delete process.env.DISCORD_EMOJI_WARRIOR;
    else process.env.DISCORD_EMOJI_WARRIOR = originalWarrior;
  });

  it("bez configu padá na Unicode emoji podle role", () => {
    expect(emojiFor("Warrior", "TANK")).toBe("🛡️");
    expect(emojiFor("Priest", "HEALER")).toBe("✨");
    expect(emojiFor("Rogue", "MELEE")).toBe("⚔️");
    expect(emojiFor("Hunter", "RANGED")).toBe("🏹");
  });

  it("nakonfigurovaná třída vrátí custom emoji místo Unicode fallbacku", () => {
    process.env.DISCORD_EMOJI_WARRIOR = "<:warrior:123456789>";
    expect(emojiFor("Warrior", "TANK")).toBe("<:warrior:123456789>");
  });

  it("prázdný string v env se chová jako nenastavené", () => {
    process.env.DISCORD_EMOJI_WARRIOR = "";
    expect(emojiFor("Warrior", "TANK")).toBe("🛡️");
  });
});
