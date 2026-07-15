import "server-only";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { note, noteRevision, user, character, raid } from "@/db/schema";
import { getAttendanceRowsInPeriod } from "./attendance-query";
import { computeAttendanceStats, type AttendanceStats } from "./attendance-stats";
import { resolveDisplayName } from "./display-name";
import { toPragueDateKey } from "./local-date";
import { getMainCharactersByUserId } from "./main-character";
import { isWithinPeriod, type PeriodFilter } from "./period-filter";
import { aggregateNotesBySubject, compareRosterEntries, isNoteVisibleTo, type GuildRank } from "./notes-visibility";

export type NoteCategory = (typeof note.category.enumValues)[number];
export type NoteSentiment = (typeof note.sentiment.enumValues)[number];
export type NoteVisibilityValue = (typeof note.visibility.enumValues)[number];

/**
 * Centrální filtr viditelnosti — smazaná poznámka není viditelná nikomu (ani
 * autorovi), jinak LEADERSHIP vidí kdokoli z vedení, PRIVATE jen její autor.
 * Logický ekvivalent `notes-visibility.ts#isNoteVisibleTo` (ten je čistý a
 * testovaný, tenhle je SQL WHERE pro dotazy) — drž obě verze v souladu.
 */
export function visibleNotesFilter(currentUserId: string) {
  return and(
    isNull(note.deletedAt),
    or(eq(note.visibility, "LEADERSHIP"), and(eq(note.visibility, "PRIVATE"), eq(note.authorId, currentUserId))),
  );
}

export type NoteWithContext = {
  id: string;
  authorId: string;
  authorDisplayName: string;
  subjectUserId: string;
  characterId: string | null;
  characterName: string | null;
  raidId: string | null;
  raidInstance: string | null;
  raidStartsAt: Date | null;
  category: NoteCategory;
  sentiment: NoteSentiment;
  visibility: NoteVisibilityValue;
  pinned: boolean;
  body: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Poznámky k hráči viditelné `currentUserId` — join na autora, postavu a raid
 * (jméno + datum). Řazeno pinned DESC, createdAt DESC; rozdělení na "obecné" vs.
 * "z raidů" a seskupení po raidech dělá až UI vrstva (`/roster/[userId]`).
 *
 * `authorDisplayName` jde přes `resolveDisplayName` (hlavní postava, jinak
 * Discord displayName) — stejná konvence jako všude jinde v appce (viz
 * `getRosterOverview` níže). `characterName` je záměrně JEN raw join na
 * `character.name` bez `resolveDisplayName` — to je konkrétní kontextová
 * postava poznámky (ne zobrazovací jméno hráče) a leftJoin bez `deletedAt`
 * filtru je záměr: poznámka na později smazanou postavu má zůstat čitelná.
 */
export async function getNotesForSubject(
  subjectUserId: string,
  currentUserId: string,
): Promise<NoteWithContext[]> {
  const rows = await db
    .select({
      id: note.id,
      authorId: note.authorId,
      authorDisplayName: user.displayName,
      subjectUserId: note.subjectUserId,
      characterId: note.characterId,
      characterName: character.name,
      raidId: note.raidId,
      raidInstance: raid.instance,
      raidStartsAt: raid.startsAt,
      category: note.category,
      sentiment: note.sentiment,
      visibility: note.visibility,
      pinned: note.pinned,
      body: note.body,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    })
    .from(note)
    .innerJoin(user, eq(user.id, note.authorId))
    .leftJoin(character, eq(character.id, note.characterId))
    .leftJoin(raid, eq(raid.id, note.raidId))
    .where(and(eq(note.subjectUserId, subjectUserId), visibleNotesFilter(currentUserId)))
    .orderBy(desc(note.pinned), desc(note.createdAt));

  const authorIds = [...new Set(rows.map((r) => r.authorId))];
  const mainCharacters = await getMainCharactersByUserId(authorIds);

  return rows.map((r) => ({
    ...r,
    authorDisplayName: resolveDisplayName({ displayName: r.authorDisplayName }, mainCharacters.get(r.authorId)?.name ?? null),
  }));
}

export type RosterOverviewRow = {
  userId: string;
  displayName: string;
  guildRank: GuildRank | null;
  mainCharacterClass: string | null;
  noteCount: number;
  hasOpenConcern: boolean;
  // Kategorie viditelných poznámek tohoto hráče (distinct) — pro filtr kategorie na /roster.
  noteCategories: NoteCategory[];
  stats: AttendanceStats;
};

/**
 * Řádek na každého nesmazaného hráče — docházka recyklovaná z
 * `getAttendanceRowsInPeriod` + `computeAttendanceStats` (žádná nová logika
 * metrik, viz zadání), počet viditelných poznámek a otevřený CONCERN flag
 * agregovaný přes stejný `visibleNotesFilter`. Řazeno guildRank -> jméno
 * (`compareRosterEntries`, stejné pořadí jako SQL `ORDER BY guild_rank`).
 *
 * Poznámky se filtrují na `period` V JS (`isWithinPeriod`/`toPragueDateKey`),
 * ne v SQL — pražská timezone smí žít jen na jednom místě (stejně jako
 * `getAttendanceRowsInPeriod`), aby se druhá SQL implementace časem nerozešla
 * s tou první. Cena (načtení všech viditelných poznámek do paměti) je při
 * velikosti guildy zanedbatelná. Bez tohohle filtru by `noteCount`/
 * `hasOpenConcern` ignorovaly zvolené období úplně — a protože `hasOpenConcern`
 * nemá žádný "resolved" stav, po delší době provozu by skoro každý hráč měl
 * aspoň jednu poznámku nastavenou jako "CONCERN" a flag by zůstal navždy
 * zapnutý bez ohledu na filtr.
 */
export async function getRosterOverview(
  currentUserId: string,
  period: PeriodFilter,
): Promise<RosterOverviewRow[]> {
  const userRows = await db
    .select({ id: user.id, displayName: user.displayName, guildRank: user.guildRank })
    .from(user)
    .where(isNull(user.deletedAt));

  const userIds = userRows.map((u) => u.id);
  const mainCharacters = await getMainCharactersByUserId(userIds);

  const attendanceRows = await getAttendanceRowsInPeriod(period);
  const attendanceByUser = new Map<string, typeof attendanceRows>();
  for (const row of attendanceRows) {
    const list = attendanceByUser.get(row.userId) ?? [];
    list.push(row);
    attendanceByUser.set(row.userId, list);
  }

  const visibleNotes = await db
    .select({ subjectUserId: note.subjectUserId, category: note.category, sentiment: note.sentiment, createdAt: note.createdAt })
    .from(note)
    .where(visibleNotesFilter(currentUserId));
  const notesInPeriod = visibleNotes.filter((n) => isWithinPeriod(toPragueDateKey(n.createdAt), period));
  const noteAggByUserId = aggregateNotesBySubject(notesInPeriod);

  const rows: RosterOverviewRow[] = userRows.map((u) => {
    const mainChar = mainCharacters.get(u.id);
    const agg = noteAggByUserId.get(u.id);
    const entries = attendanceByUser.get(u.id) ?? [];
    return {
      userId: u.id,
      displayName: resolveDisplayName({ displayName: u.displayName }, mainChar?.name ?? null),
      guildRank: u.guildRank,
      mainCharacterClass: mainChar?.class ?? null,
      noteCount: agg?.noteCount ?? 0,
      hasOpenConcern: agg?.hasOpenConcern ?? false,
      noteCategories: agg?.noteCategories ?? [],
      stats: computeAttendanceStats(entries.map((e) => ({ status: e.status, role: e.role }))),
    };
  });

  return rows.sort(compareRosterEntries);
}

export type NoteRevisionRow = {
  id: string;
  editedBy: string;
  editedByDisplayName: string;
  editedAt: Date;
  previousBody: string;
};

/** Revize poznámky — nejdřív ověří, že `currentUserId` na tu poznámku vůbec vidí (LEADERSHIP/PRIVATE). */
export async function getNoteRevisions(noteId: string, currentUserId: string): Promise<NoteRevisionRow[]> {
  const [noteRow] = await db
    .select({ visibility: note.visibility, authorId: note.authorId, deletedAt: note.deletedAt })
    .from(note)
    .where(eq(note.id, noteId))
    .limit(1);
  if (!noteRow || !isNoteVisibleTo(noteRow, currentUserId)) {
    throw new Error("Poznámka nenalezena nebo nepřístupná.");
  }

  return db
    .select({
      id: noteRevision.id,
      editedBy: noteRevision.editedBy,
      editedByDisplayName: user.displayName,
      editedAt: noteRevision.editedAt,
      previousBody: noteRevision.previousBody,
    })
    .from(noteRevision)
    .innerJoin(user, eq(user.id, noteRevision.editedBy))
    .where(eq(noteRevision.noteId, noteId))
    .orderBy(desc(noteRevision.editedAt));
}
