import { describe, expect, it } from "vitest";
import {
  aggregateNotesBySubject,
  compareRosterEntries,
  isNoteVisibleTo,
  GUILD_RANK_ORDER,
  type NoteAggInput,
  type RosterSortEntry,
} from "./notes-visibility";

describe("isNoteVisibleTo", () => {
  it("LEADERSHIP poznámka je viditelná pro jiného člena vedení", () => {
    const note = { visibility: "LEADERSHIP" as const, authorId: "author-1", deletedAt: null };
    expect(isNoteVisibleTo(note, "other-leader")).toBe(true);
  });

  it("PRIVATE poznámka není viditelná pro jiného člena vedení (ani pro ADMINa)", () => {
    const note = { visibility: "PRIVATE" as const, authorId: "author-1", deletedAt: null };
    expect(isNoteVisibleTo(note, "other-leader")).toBe(false);
    expect(isNoteVisibleTo(note, "admin-user")).toBe(false);
  });

  it("PRIVATE poznámka je viditelná svému autorovi", () => {
    const note = { visibility: "PRIVATE" as const, authorId: "author-1", deletedAt: null };
    expect(isNoteVisibleTo(note, "author-1")).toBe(true);
  });

  it("smazaná LEADERSHIP poznámka není viditelná nikomu", () => {
    const note = { visibility: "LEADERSHIP" as const, authorId: "author-1", deletedAt: new Date() };
    expect(isNoteVisibleTo(note, "other-leader")).toBe(false);
    expect(isNoteVisibleTo(note, "author-1")).toBe(false);
  });

  it("smazaná PRIVATE poznámka není viditelná ani vlastnímu autorovi", () => {
    const note = { visibility: "PRIVATE" as const, authorId: "author-1", deletedAt: new Date() };
    expect(isNoteVisibleTo(note, "author-1")).toBe(false);
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

describe("aggregateNotesBySubject", () => {
  it("prázdný vstup dá prázdnou mapu", () => {
    expect(aggregateNotesBySubject([])).toEqual(new Map());
  });

  it("jeden hráč bez CONCERN", () => {
    const notes: NoteAggInput[] = [
      { subjectUserId: "u1", category: "PERFORMANCE", sentiment: "POSITIVE" },
      { subjectUserId: "u1", category: "PERFORMANCE", sentiment: "NEUTRAL" },
    ];
    const result = aggregateNotesBySubject(notes);
    expect(result.get("u1")).toEqual({
      noteCount: 2,
      hasOpenConcern: false,
      noteCategories: ["PERFORMANCE"],
    });
  });

  it("jeden hráč s CONCERN", () => {
    const notes: NoteAggInput[] = [
      { subjectUserId: "u1", category: "BEHAVIOR", sentiment: "CONCERN" },
    ];
    const result = aggregateNotesBySubject(notes);
    expect(result.get("u1")?.hasOpenConcern).toBe(true);
  });

  it("kategorie jsou deduplikované a seřazené", () => {
    const notes: NoteAggInput[] = [
      { subjectUserId: "u1", category: "OTHER", sentiment: "NEUTRAL" },
      { subjectUserId: "u1", category: "ATTENDANCE", sentiment: "NEUTRAL" },
      { subjectUserId: "u1", category: "ATTENDANCE", sentiment: "NEUTRAL" },
    ];
    const result = aggregateNotesBySubject(notes);
    expect(result.get("u1")?.noteCategories).toEqual(["ATTENDANCE", "OTHER"]);
  });

  it("víc hráčů se agreguje zvlášť", () => {
    const notes: NoteAggInput[] = [
      { subjectUserId: "u1", category: "OTHER", sentiment: "CONCERN" },
      { subjectUserId: "u2", category: "LOOT", sentiment: "POSITIVE" },
    ];
    const result = aggregateNotesBySubject(notes);
    expect(result.get("u1")).toEqual({ noteCount: 1, hasOpenConcern: true, noteCategories: ["OTHER"] });
    expect(result.get("u2")).toEqual({ noteCount: 1, hasOpenConcern: false, noteCategories: ["LOOT"] });
  });
});
