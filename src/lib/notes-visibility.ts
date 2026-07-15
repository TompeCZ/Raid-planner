/**
 * Čistá (bez DB) pravidla viditelnosti poznámek a řazení rosteru — DB dotazy
 * žijí v `notes-query.ts#visibleNotesFilter` (stejná logika jako SQL WHERE,
 * udržuj obě verze v souladu), tenhle modul jen predikát/komparátor nad už
 * načtenými daty. Odděleno kvůli testovatelnosti bez `server-only` řetězce
 * (viz CLAUDE.md konvence, vzor `attendance-stats.ts`). `import type` z
 * `@/db/schema` je bezpečný i tady — schema.ts sám žádný `server-only`
 * řetězec netáhne, jde jen o typy (erased při kompilaci).
 */
import type { note as noteTable } from "@/db/schema";

export type NoteCategory = (typeof noteTable.category.enumValues)[number];
export type NoteSentiment = (typeof noteTable.sentiment.enumValues)[number];

export type NoteVisibility = "LEADERSHIP" | "PRIVATE";

export type VisibilityCheckRow = { visibility: NoteVisibility; authorId: string; deletedAt: Date | null };

/**
 * Smazaná (soft-deleted) poznámka není viditelná nikomu, ani autorovi — kontrola
 * JEŠTĚ PŘED visibility. Jinak LEADERSHIP vidí kdokoli z vedení; PRIVATE jen
 * její autor (i ADMIN je mimo, pokud není autor).
 */
export function isNoteVisibleTo(note: VisibilityCheckRow, currentUserId: string): boolean {
  if (note.deletedAt !== null) return false;
  if (note.visibility === "LEADERSHIP") return true;
  return note.authorId === currentUserId;
}

// Pořadí je významné — odpovídá deklaraci `guildRank` enumu v src/db/schema.ts
// (Postgres řadí enum stejně, ORDER BY guild_rank v SQL dá stejný výsledek).
export const GUILD_RANK_ORDER = [
  "GUILDMASTER",
  "OFFICER",
  "VETERAN",
  "MEMBER",
  "INITIATE",
  "RECRUIT",
  "ALT",
] as const;

export type GuildRank = (typeof GUILD_RANK_ORDER)[number];

export type RosterSortEntry = { guildRank: GuildRank | null; displayName: string };

/** Řazení rosteru: guildRank podle pořadí enumu (nenastavený rank na konec), pak jméno. */
export function compareRosterEntries(a: RosterSortEntry, b: RosterSortEntry): number {
  const rankA = a.guildRank ? GUILD_RANK_ORDER.indexOf(a.guildRank) : GUILD_RANK_ORDER.length;
  const rankB = b.guildRank ? GUILD_RANK_ORDER.indexOf(b.guildRank) : GUILD_RANK_ORDER.length;
  if (rankA !== rankB) return rankA - rankB;
  return a.displayName.localeCompare(b.displayName);
}

export type NoteAggInput = {
  subjectUserId: string;
  category: NoteCategory;
  sentiment: NoteSentiment;
};

export type NoteAggResult = {
  noteCount: number;
  hasOpenConcern: boolean;
  noteCategories: NoteCategory[];
};

/**
 * Agregace poznámek na hráče — sémantika 1:1 se SQL `count(*)` /
 * `bool_or(sentiment = 'CONCERN')` / `array_agg(distinct category)`, ale nad
 * už načtenými (a v `getRosterOverview` navíc JS-filtrovanými podle období)
 * řádky. Kategorie vrací deduplikované a seřazené — na rozdíl od
 * `array_agg` je tak výstup deterministický (stabilní pro testy/snapshoty).
 */
export function aggregateNotesBySubject(notes: NoteAggInput[]): Map<string, NoteAggResult> {
  const byUser = new Map<string, NoteAggInput[]>();
  for (const n of notes) {
    const list = byUser.get(n.subjectUserId) ?? [];
    list.push(n);
    byUser.set(n.subjectUserId, list);
  }

  const result = new Map<string, NoteAggResult>();
  for (const [subjectUserId, entries] of byUser) {
    result.set(subjectUserId, {
      noteCount: entries.length,
      hasOpenConcern: entries.some((e) => e.sentiment === "CONCERN"),
      noteCategories: [...new Set(entries.map((e) => e.category))].sort(),
    });
  }
  return result;
}
