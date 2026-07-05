import { describe, expect, it } from "vitest";
import {
  buildSetupChangeNoticeContent,
  buildSetupEmbed,
  buildSetupPingContent,
  diffSetupSnapshots,
  type DiscordSetupSnapshotEntry,
} from "./discord-setup-embed";

describe("buildSetupEmbed", () => {
  it("neprázdné skupiny jsou inline fieldy, prázdné se vynechají", () => {
    const embed = buildSetupEmbed({
      raidInstance: "Karazhan",
      raidDateLabel: "út 8.7. 20:00",
      groups: [
        { groupNo: 1, members: [{ characterName: "Tankozor", characterClass: "Warrior", role: "TANK" }] },
        { groupNo: 2, members: [] },
      ],
      bench: [],
      late: [],
      absence: [],
    });

    const groupFields = embed.fields?.filter((f) => f.name.startsWith("Skupina")) ?? [];
    expect(groupFields).toHaveLength(1);
    expect(groupFields[0].name).toBe("Skupina 1");
    expect(groupFields[0].inline).toBe(true);
    expect(groupFields[0].value).toContain("Tankozor");
  });

  it("jméno ve skupině/na benchi je postava, ne hráč — s emoji podle role", () => {
    const embed = buildSetupEmbed({
      raidInstance: "Karazhan",
      raidDateLabel: "út 8.7. 20:00",
      groups: [{ groupNo: 1, members: [{ characterName: "Healbot", characterClass: "Priest", role: "HEALER" }] }],
      bench: [{ characterName: "Benchwarmer", characterClass: "Mage", role: "RANGED" }],
      late: [],
      absence: [],
    });

    const groupField = embed.fields?.find((f) => f.name === "Skupina 1");
    expect(groupField?.value).toBe("✨ Healbot");
    const benchField = embed.fields?.find((f) => f.name === "Bench");
    expect(benchField?.value).toBe("🏹 Benchwarmer");
    expect(benchField?.inline).toBe(false);
  });

  it("late a absence bloky se objeví, jen když mají obsah", () => {
    const withoutExtras = buildSetupEmbed({
      raidInstance: "Karazhan",
      raidDateLabel: "út 8.7.",
      groups: [],
      bench: [],
      late: [],
      absence: [],
    });
    expect(withoutExtras.fields?.find((f) => f.name === "Late")).toBeUndefined();
    expect(withoutExtras.fields?.find((f) => f.name === "Absence")).toBeUndefined();

    const withExtras = buildSetupEmbed({
      raidInstance: "Karazhan",
      raidDateLabel: "út 8.7.",
      groups: [],
      bench: [],
      late: [{ name: "Pozdílek" }],
      absence: [{ name: "Nepřítomný" }],
    });
    expect(withExtras.fields?.find((f) => f.name === "Late")?.value).toBe("🕐 Pozdílek");
    expect(withExtras.fields?.find((f) => f.name === "Absence")?.value).toBe("Nepřítomný");
  });

  it("title obsahuje instanci a datum, footer je nastavený", () => {
    const embed = buildSetupEmbed({
      raidInstance: "Tempest Keep",
      raidDateLabel: "čt 10.7. 20:00",
      groups: [],
      bench: [],
      late: [],
      absence: [],
    });
    expect(embed.title).toBe("Tempest Keep — čt 10.7. 20:00");
    expect(embed.footer?.text).toBe("Odesláno přes Raid Planner");
  });
});

describe("buildSetupPingContent", () => {
  it("spojí discordId do zmínek oddělených mezerou", () => {
    expect(buildSetupPingContent(["111", "222"])).toBe("<@111> <@222>");
  });

  it("prázdný seznam dá prázdný content", () => {
    expect(buildSetupPingContent([])).toBe("");
  });
});

describe("diffSetupSnapshots", () => {
  const entry = (userId: string): DiscordSetupSnapshotEntry => ({
    userId,
    discordId: `discord-${userId}`,
    name: `Char-${userId}`,
    state: "CONFIRMED",
    groupNo: 1,
  });

  it("detekuje přidané a stažené podle userId", () => {
    const previous = [entry("a"), entry("b")];
    const next = [entry("b"), entry("c")];

    const diff = diffSetupSnapshots(previous, next);
    expect(diff.added.map((e) => e.userId)).toEqual(["c"]);
    expect(diff.removed.map((e) => e.userId)).toEqual(["a"]);
  });

  it("beze změny nevrátí nic", () => {
    const snapshot = [entry("a")];
    const diff = diffSetupSnapshots(snapshot, snapshot);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
  });
});

describe("buildSetupChangeNoticeContent", () => {
  it("formátuje přidané jako ➕ a stažené jako ➖", () => {
    const content = buildSetupChangeNoticeContent({
      added: [{ userId: "a", discordId: "111", name: "A", state: "CONFIRMED", groupNo: 1 }],
      removed: [{ userId: "b", discordId: "222", name: "B", state: "BENCH", groupNo: null }],
    });
    expect(content).toContain("➕ <@111>");
    expect(content).toContain("➖ <@222>");
  });
});
