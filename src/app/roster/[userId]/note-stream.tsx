import Link from "next/link";
import { formatRaidDateTimeLabel } from "@/lib/local-date";
import type { NoteWithContext } from "@/lib/notes-query";
import { NoteItem } from "./note-item";

type RaidGroup = { raidId: string; instance: string; startsAt: Date; notes: NoteWithContext[] };

/** raidId IS NOT NULL poznámky seskupené po raidech, skupiny sestupně podle data raidu. */
function groupByRaid(notes: NoteWithContext[]): RaidGroup[] {
  const map = new Map<string, RaidGroup>();
  for (const n of notes) {
    if (!n.raidId || !n.raidInstance || !n.raidStartsAt) continue;
    const group = map.get(n.raidId) ?? {
      raidId: n.raidId,
      instance: n.raidInstance,
      startsAt: n.raidStartsAt,
      notes: [],
    };
    group.notes.push(n);
    map.set(n.raidId, group);
  }
  return [...map.values()].sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
}

/**
 * Dvě sekce přesně podle zadání: obecné poznámky (raidId IS NULL) a poznámky
 * z raidů (raidId IS NOT NULL), seskupené po raidech. Pořadí poznámek uvnitř
 * skupiny přebírá z `getNotesForSubject` (pinned DESC, createdAt DESC) —
 * `groupByRaid` jen rozdělí, nepřeskupuje.
 */
export function NoteStream({
  notes,
  currentUserId,
  isAdmin,
}: {
  notes: NoteWithContext[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  function canEditNote(n: NoteWithContext) {
    return n.authorId === currentUserId;
  }
  function canDeleteNote(n: NoteWithContext) {
    if (n.visibility === "PRIVATE") return n.authorId === currentUserId;
    return n.authorId === currentUserId || isAdmin;
  }

  const general = notes.filter((n) => !n.raidId);
  const raidGroups = groupByRaid(notes);

  return (
    <div>
      <h2>Obecné poznámky k hráči</h2>
      {general.length === 0 ? (
        <p style={{ opacity: 0.7 }}>Zatím žádné.</p>
      ) : (
        general.map((n) => <NoteItem key={n.id} note={n} canEdit={canEditNote(n)} canDelete={canDeleteNote(n)} />)
      )}

      <h2 style={{ marginTop: "1.5rem" }}>Poznámky z raidů</h2>
      {raidGroups.length === 0 && <p style={{ opacity: 0.7 }}>Zatím žádné.</p>}
      {raidGroups.map((g) => (
        <div key={g.raidId} style={{ marginBottom: "1.25rem" }}>
          <h3 style={{ fontSize: "0.95rem", opacity: 0.85 }}>
            <Link href={`/raids/${g.raidId}`}>{g.instance}</Link> — {formatRaidDateTimeLabel(g.startsAt)}
          </h3>
          {g.notes.map((n) => (
            <NoteItem key={n.id} note={n} canEdit={canEditNote(n)} canDelete={canDeleteNote(n)} />
          ))}
        </div>
      ))}
    </div>
  );
}
