/**
 * Čistá (bez DB) pravidla viditelnosti poznámek a řazení rosteru — DB dotazy
 * žijí v `notes-query.ts#visibleNotesFilter` (stejná logika jako SQL WHERE,
 * udržuj obě verze v souladu), tenhle modul jen predikát/komparátor nad už
 * načtenými daty. Odděleno kvůli testovatelnosti bez `server-only` řetězce
 * (viz CLAUDE.md konvence, vzor `attendance-stats.ts`).
 */
export type NoteVisibility = "LEADERSHIP" | "PRIVATE";

export type VisibilityCheckRow = { visibility: NoteVisibility; authorId: string };

/** LEADERSHIP vidí kdokoli z vedení; PRIVATE jen její autor (i ADMIN je mimo, pokud není autor). */
export function isNoteVisibleTo(note: VisibilityCheckRow, currentUserId: string): boolean {
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
