import { describe, expect, it } from "vitest";
import { compareRosterEntries, isNoteVisibleTo, GUILD_RANK_ORDER, type RosterSortEntry } from "./notes-visibility";

describe("isNoteVisibleTo", () => {
  it("LEADERSHIP poznámka je viditelná pro jiného člena vedení", () => {
    const note = { visibility: "LEADERSHIP" as const, authorId: "author-1" };
    expect(isNoteVisibleTo(note, "other-leader")).toBe(true);
  });

  it("PRIVATE poznámka není viditelná pro jiného člena vedení (ani pro ADMINa)", () => {
    const note = { visibility: "PRIVATE" as const, authorId: "author-1" };
    expect(isNoteVisibleTo(note, "other-leader")).toBe(false);
    expect(isNoteVisibleTo(note, "admin-user")).toBe(false);
  });

  it("PRIVATE poznámka je viditelná svému autorovi", () => {
    const note = { visibility: "PRIVATE" as const, authorId: "author-1" };
    expect(isNoteVisibleTo(note, "author-1")).toBe(true);
  });
});

describe("compareRosterEntries", () => {
  it("řazení podle guildRank odpovídá pořadí enumu (GUILDMASTER první, ALT poslední)", () => {
    const entries: RosterSortEntry[] = [
      { guildRank: "ALT", displayName: "Zoe" },
      { guildRank: "GUILDMASTER", displayName: "Anna" },
      { guildRank: "RECRUIT", displayName: "Bob" },
      { guildRank: "MEMBER", displayName: "Carl" },
    ];
    const sorted = [...entries].sort(compareRosterEntries);
    expect(sorted.map((e) => e.guildRank)).toEqual(["GUILDMASTER", "MEMBER", "RECRUIT", "ALT"]);
  });

  it("nenastavený rank (null) skončí až za všemi nastavenými", () => {
    const entries: RosterSortEntry[] = [
      { guildRank: null, displayName: "NoRank" },
      { guildRank: "ALT", displayName: "HasAlt" },
    ];
    const sorted = [...entries].sort(compareRosterEntries);
    expect(sorted.map((e) => e.displayName)).toEqual(["HasAlt", "NoRank"]);
  });

  it("shoda ranku se řadí podle jména", () => {
    const entries: RosterSortEntry[] = [
      { guildRank: "MEMBER", displayName: "Zed" },
      { guildRank: "MEMBER", displayName: "Alice" },
    ];
    const sorted = [...entries].sort(compareRosterEntries);
    expect(sorted.map((e) => e.displayName)).toEqual(["Alice", "Zed"]);
  });

  it("GUILD_RANK_ORDER odpovídá schema.ts deklaraci (7 hodnot, GUILDMASTER první, ALT poslední)", () => {
    expect(GUILD_RANK_ORDER).toEqual([
      "GUILDMASTER",
      "OFFICER",
      "VETERAN",
      "MEMBER",
      "INITIATE",
      "RECRUIT",
      "ALT",
    ]);
  });
});
