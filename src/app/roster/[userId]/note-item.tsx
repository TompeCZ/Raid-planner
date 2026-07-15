"use client";

import { useState, useTransition } from "react";
import { deleteNote, togglePinned, updateNote, type NoteCategoryValue, type NoteSentimentValue } from "../actions";
import { fetchNoteRevisions } from "./actions";
import type { NoteRevisionRow, NoteWithContext } from "@/lib/notes-query";

const CATEGORIES: NoteCategoryValue[] = ["PERFORMANCE", "BEHAVIOR", "ATTENDANCE", "LOOT", "RECRUITMENT", "OTHER"];
const SENTIMENTS: NoteSentimentValue[] = ["POSITIVE", "NEUTRAL", "CONCERN"];

const SENTIMENT_COLOR: Record<NoteSentimentValue, string> = {
  POSITIVE: "#4ea1ff",
  NEUTRAL: "#888",
  CONCERN: "#e8534a",
};

function formatDate(d: Date): string {
  return new Date(d).toLocaleString("cs-CZ");
}

type Props = {
  note: NoteWithContext;
  canEdit: boolean;
  canDelete: boolean;
};

/**
 * Jedna poznámka v proudu — pin/edit/delete podle pravidel z §3 (spočtené na
 * serveru do `canEdit`/`canDelete`, klient jen zobrazuje). "Soukromá" badge u
 * PRIVATE musí být jasně vidět, jinak by RL mohli zapomenout, že ji vidí jen oni.
 */
export function NoteItem({ note, canEdit, canDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  const [category, setCategory] = useState<NoteCategoryValue>(note.category);
  const [sentiment, setSentiment] = useState<NoteSentimentValue>(note.sentiment);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [revisions, setRevisions] = useState<NoteRevisionRow[] | null>(null);
  const [revisionsLoading, setRevisionsLoading] = useState(false);

  const wasEdited = note.updatedAt.getTime() !== note.createdAt.getTime();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        await updateNote({ noteId: note.id, body, category, sentiment });
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Něco se pokazilo.");
      }
    });
  }

  function handleCancelEdit() {
    setEditing(false);
    setBody(note.body);
    setCategory(note.category);
    setSentiment(note.sentiment);
  }

  function handleDelete() {
    if (!confirm("Smazat poznámku?")) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteNote({ noteId: note.id });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Něco se pokazilo.");
      }
    });
  }

  function handleTogglePin() {
    setError(null);
    startTransition(async () => {
      try {
        await togglePinned({ noteId: note.id });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Něco se pokazilo.");
      }
    });
  }

  function handleToggleRevisions() {
    const next = !revisionsOpen;
    setRevisionsOpen(next);
    if (next && revisions === null) {
      setRevisionsLoading(true);
      fetchNoteRevisions(note.id)
        .then(setRevisions)
        .catch(() => setRevisions([]))
        .finally(() => setRevisionsLoading(false));
    }
  }

  return (
    <div
      style={{
        border: note.pinned ? "1px solid #e8b339" : "1px solid #333",
        borderRadius: 6,
        padding: "0.6rem 0.75rem",
        marginBottom: "0.5rem",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "0.4rem",
          flexWrap: "wrap",
          alignItems: "center",
          fontSize: "0.75rem",
          opacity: 0.8,
          marginBottom: "0.35rem",
        }}
      >
        <span style={{ border: "1px solid #555", borderRadius: 10, padding: "0.05rem 0.5rem" }}>{note.category}</span>
        <span
          style={{
            border: `1px solid ${SENTIMENT_COLOR[note.sentiment]}`,
            color: SENTIMENT_COLOR[note.sentiment],
            borderRadius: 10,
            padding: "0.05rem 0.5rem",
          }}
        >
          {note.sentiment}
        </span>
        {note.visibility === "PRIVATE" && (
          <span
            style={{
              border: "1px solid #e8534a",
              color: "#e8534a",
              borderRadius: 10,
              padding: "0.05rem 0.5rem",
              fontWeight: "bold",
            }}
          >
            Soukromá
          </span>
        )}
        {note.pinned && <span title="Připnuto">📌</span>}
        {note.characterName && <span>· {note.characterName}</span>}
      </div>

      {editing ? (
        <div style={{ display: "grid", gap: "0.4rem" }}>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} style={{ width: "100%" }} />
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <select value={category} onChange={(e) => setCategory(e.target.value as NoteCategoryValue)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select value={sentiment} onChange={(e) => setSentiment(e.target.value as NoteSentimentValue)}>
              {SENTIMENTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button type="button" onClick={handleSave} disabled={isPending}>
              Uložit
            </button>
            <button type="button" onClick={handleCancelEdit} disabled={isPending}>
              Zrušit
            </button>
          </div>
        </div>
      ) : (
        <p style={{ whiteSpace: "pre-wrap", margin: "0 0 0.4rem" }}>{note.body}</p>
      )}

      {error && <p style={{ color: "#ff6b6b", fontSize: "0.85rem" }}>{error}</p>}

      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center", fontSize: "0.75rem", opacity: 0.7 }}>
        <span>
          {note.authorDisplayName} · {formatDate(note.createdAt)}
        </span>
        {wasEdited && (
          <button type="button" onClick={handleToggleRevisions} style={{ fontSize: "0.75rem" }}>
            upraveno {formatDate(note.updatedAt)} {revisionsOpen ? "▲" : "▼"}
          </button>
        )}
        {canEdit && !editing && (
          <button type="button" onClick={handleTogglePin} disabled={isPending}>
            {note.pinned ? "Odepnout" : "Připnout"}
          </button>
        )}
        {canEdit && !editing && (
          <button type="button" onClick={() => setEditing(true)} disabled={isPending}>
            Upravit
          </button>
        )}
        {canDelete && (
          <button type="button" onClick={handleDelete} disabled={isPending}>
            Smazat
          </button>
        )}
      </div>

      {revisionsOpen && (
        <div style={{ marginTop: "0.4rem", borderTop: "1px solid #333", paddingTop: "0.4rem", fontSize: "0.8rem" }}>
          {revisionsLoading && <p style={{ opacity: 0.6 }}>Načítám historii…</p>}
          {revisions && revisions.length === 0 && <p style={{ opacity: 0.6 }}>Žádná historie.</p>}
          {revisions?.map((rev) => (
            <div key={rev.id} style={{ marginBottom: "0.3rem" }}>
              <div style={{ opacity: 0.6 }}>
                {rev.editedByDisplayName} · {formatDate(rev.editedAt)}
              </div>
              <div style={{ whiteSpace: "pre-wrap" }}>{rev.previousBody}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
