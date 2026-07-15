"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  note,
  noteRevision,
  user,
  character,
  raid,
  guildRank as guildRankEnum,
  noteCategory,
  noteSentiment,
  noteVisibility,
  type User,
} from "@/db/schema";
import { canAccessNotes, getCurrentAppUser } from "@/lib/auth";

const NOTE_CATEGORIES = noteCategory.enumValues;
const NOTE_SENTIMENTS = noteSentiment.enumValues;
const NOTE_VISIBILITIES = noteVisibility.enumValues;
const GUILD_RANKS = guildRankEnum.enumValues;

export type NoteCategoryValue = (typeof NOTE_CATEGORIES)[number];
export type NoteSentimentValue = (typeof NOTE_SENTIMENTS)[number];
export type NoteVisibilityValue = (typeof NOTE_VISIBILITIES)[number];
export type GuildRankValue = (typeof GUILD_RANKS)[number];

async function requireAppUser(): Promise<User> {
  const appUser = await getCurrentAppUser();
  if (!appUser) throw new Error("Nepřihlášeno.");
  return appUser;
}

async function requireLeadership(): Promise<User> {
  const appUser = await requireAppUser();
  if (!canAccessNotes(appUser)) throw new Error("Nedostatečná oprávnění.");
  return appUser;
}

function revalidateNoteRoutes(subjectUserId: string, raidId: string | null) {
  revalidatePath(`/roster/${subjectUserId}`);
  revalidatePath("/roster");
  if (raidId) revalidatePath(`/raids/${raidId}`);
}

export async function createNote(input: {
  subjectUserId: string;
  characterId?: string | null;
  raidId?: string | null;
  category: NoteCategoryValue;
  sentiment: NoteSentimentValue;
  visibility: NoteVisibilityValue;
  body: string;
}) {
  const appUser = await requireLeadership();

  const body = input.body.trim();
  if (!body) throw new Error("Text poznámky je povinný.");
  if (!NOTE_CATEGORIES.includes(input.category)) throw new Error("Neplatná kategorie.");
  if (!NOTE_SENTIMENTS.includes(input.sentiment)) throw new Error("Neplatný sentiment.");
  if (!NOTE_VISIBILITIES.includes(input.visibility)) throw new Error("Neplatná viditelnost.");

  const [subjectRow] = await db.select({ id: user.id }).from(user).where(eq(user.id, input.subjectUserId)).limit(1);
  if (!subjectRow) throw new Error("Hráč nenalezen.");

  const characterId = input.characterId || null;
  if (characterId) {
    // DB composite FK (note_character_subject_fk) by cizí postavu stejně odmítla
    // (viz catch níže) — tahle kontrola je jen pro čitelnou hlášku dřív.
    const [charRow] = await db
      .select({ id: character.id, userId: character.userId })
      .from(character)
      .where(eq(character.id, characterId))
      .limit(1);
    if (!charRow) throw new Error("Postava nenalezena.");
    if (charRow.userId !== input.subjectUserId) throw new Error("Postava nepatří tomuto hráči.");
  }

  const raidId = input.raidId || null;
  if (raidId) {
    const [raidRow] = await db.select({ id: raid.id }).from(raid).where(eq(raid.id, raidId)).limit(1);
    if (!raidRow) throw new Error("Raid nenalezen.");
  }

  try {
    await db.insert(note).values({
      authorId: appUser.id,
      subjectUserId: input.subjectUserId,
      characterId,
      raidId,
      category: input.category,
      sentiment: input.sentiment,
      visibility: input.visibility,
      body,
    });
  } catch (err) {
    const cause = (err as { cause?: { code?: string } } | null)?.cause;
    if (cause?.code === "23503") {
      throw new Error("Postava nepatří tomuto hráči.");
    }
    throw err;
  }

  revalidateNoteRoutes(input.subjectUserId, raidId);
}

/** Editovat smí jen autor. PRIVATE mimo autora hlásíme jako "nenalezena", ať neprozradíme existenci. */
async function requireEditableNote(noteId: string, appUser: User) {
  const [existing] = await db.select().from(note).where(eq(note.id, noteId)).limit(1);
  if (!existing) throw new Error("Poznámka nenalezena.");
  if (existing.visibility === "PRIVATE" && existing.authorId !== appUser.id) {
    throw new Error("Poznámka nenalezena.");
  }
  if (existing.authorId !== appUser.id) throw new Error("Upravit smí jen autor poznámky.");
  return existing;
}

/** Před UPDATE vloží starý `body` do `note_revision` (historie), obojí v jedné transakci. */
export async function updateNote(input: {
  noteId: string;
  body: string;
  category: NoteCategoryValue;
  sentiment: NoteSentimentValue;
}) {
  const appUser = await requireLeadership();
  const existing = await requireEditableNote(input.noteId, appUser);

  const body = input.body.trim();
  if (!body) throw new Error("Text poznámky je povinný.");
  if (!NOTE_CATEGORIES.includes(input.category)) throw new Error("Neplatná kategorie.");
  if (!NOTE_SENTIMENTS.includes(input.sentiment)) throw new Error("Neplatný sentiment.");

  await db.transaction(async (tx) => {
    await tx.insert(noteRevision).values({
      noteId: existing.id,
      editedBy: appUser.id,
      previousBody: existing.body,
    });
    await tx
      .update(note)
      .set({ body, category: input.category, sentiment: input.sentiment, updatedAt: new Date() })
      .where(eq(note.id, existing.id));
  });

  revalidateNoteRoutes(existing.subjectUserId, existing.raidId);
}

export async function deleteNote(input: { noteId: string }) {
  const appUser = await requireLeadership();

  const [existing] = await db.select().from(note).where(eq(note.id, input.noteId)).limit(1);
  if (!existing) throw new Error("Poznámka nenalezena.");

  const isAuthor = existing.authorId === appUser.id;
  if (existing.visibility === "PRIVATE") {
    // PRIVATE: vidí, edituje i maže pouze autor — ADMIN ji nevidí, a tedy ani nesmí smazat.
    if (!isAuthor) throw new Error("Poznámka nenalezena.");
  } else if (!isAuthor && appUser.role !== "ADMIN") {
    throw new Error("Smazat smí jen autor poznámky, nebo ADMIN.");
  }

  await db.delete(note).where(eq(note.id, existing.id));
  revalidateNoteRoutes(existing.subjectUserId, existing.raidId);
}

/**
 * Připnutí nahoru v rámci sekce — stejné pravidlo jako editace (jen autor;
 * PRIVATE mimo autora "nenalezena"), pin je mutace obsahu poznámky stejně
 * jako `updateNote`, ne samostatná "team highlight" akce (zadání to explicitně
 * nerozlišuje, tohle je nejbližší analogie k `updateNote`).
 */
export async function togglePinned(input: { noteId: string }) {
  const appUser = await requireLeadership();
  const existing = await requireEditableNote(input.noteId, appUser);

  await db.update(note).set({ pinned: !existing.pinned }).where(eq(note.id, existing.id));
  revalidateNoteRoutes(existing.subjectUserId, existing.raidId);
}

/** guildRank může být null (odnastavit) — kdokoli z vedení. */
export async function setGuildRank(input: { userId: string; guildRank: GuildRankValue | null }) {
  await requireLeadership();

  if (input.guildRank !== null && !GUILD_RANKS.includes(input.guildRank)) {
    throw new Error("Neplatný guild rank.");
  }

  const [userRow] = await db.select({ id: user.id }).from(user).where(eq(user.id, input.userId)).limit(1);
  if (!userRow) throw new Error("Hráč nenalezen.");

  await db.update(user).set({ guildRank: input.guildRank }).where(eq(user.id, input.userId));

  revalidatePath(`/roster/${input.userId}`);
  revalidatePath("/roster");
}
