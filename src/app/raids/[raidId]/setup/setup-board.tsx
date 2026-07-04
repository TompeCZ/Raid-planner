"use client";

import { useMemo, useState, useTransition } from "react";
import type { CSSProperties } from "react";
import type { Assignment } from "@/db/schema";
import type { BusyElsewhere } from "@/lib/character-availability";
import {
  assignToGroup,
  benchCharacter,
  removeAssignment,
  setAssignmentRole,
  swapAssignments,
  updateSetupNotes,
  type CharRole,
  type RosterCharacter,
} from "./actions";
import { GROUP_COUNT, SLOTS_PER_GROUP } from "./setup-validation";

const GROUPS = Array.from({ length: GROUP_COUNT }, (_, i) => i + 1);
const SLOTS = Array.from({ length: SLOTS_PER_GROUP }, (_, i) => i + 1);
const ALL_ROLES: CharRole[] = ["TANK", "HEALER", "MELEE", "RANGED"];

function formatTimeRange(startsAt: Date, endsAt: Date): string {
  return `${startsAt.toLocaleString("cs-CZ")} – ${endsAt.toLocaleString("cs-CZ")}`;
}

type Props = {
  raidId: string;
  roster: RosterCharacter[];
  otherCharacters: RosterCharacter[];
  assignments: Assignment[];
  conflictedAssignmentIds: string[];
  busyElsewhere: BusyElsewhere[];
  initialNotes: string | null;
  readOnly: boolean;
};

function groupByUser(list: RosterCharacter[]): Map<string, RosterCharacter[]> {
  const map = new Map<string, RosterCharacter[]>();
  for (const c of list) {
    const bucket = map.get(c.userId) ?? [];
    bucket.push(c);
    map.set(c.userId, bucket);
  }
  return map;
}

/** Malý tag na hráče — hover/focus ukáže popup s jeho ostatními postavami v tomto seznamu. */
function PlayerTag({
  displayName,
  siblings,
}: {
  displayName: string;
  siblings: RosterCharacter[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <span
      style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span
        tabIndex={0}
        style={{
          fontSize: "0.75rem",
          opacity: 0.7,
          borderBottom: "1px dotted currentColor",
          cursor: "default",
        }}
      >
        {displayName}
      </span>
      {open && siblings.length > 0 && (
        <div
          style={{
            position: "absolute",
            zIndex: 10,
            top: "1.4rem",
            left: 0,
            background: "#1c1c1c",
            border: "1px solid #444",
            borderRadius: 4,
            padding: "0.5rem 0.65rem",
            minWidth: 180,
            boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: "0.25rem" }}>{displayName}</div>
          <ul style={{ margin: "0.25rem 0 0", padding: "0 0 0 1rem" }}>
            {siblings.map((s) => (
              <li key={s.characterId} style={{ fontSize: "0.8rem" }}>
                {s.characterName} ({s.characterClass}, {s.characterRole})
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
}

function rosterEntryStyle(opts: { disabled: boolean; isSelected: boolean; readOnly: boolean }): CSSProperties {
  return {
    border: opts.isSelected ? "1px solid #7a7a7a" : "1px solid #444",
    borderRadius: 4,
    padding: "0.4rem 0.6rem",
    fontSize: "0.9rem",
    opacity: opts.disabled ? 0.35 : opts.isSelected ? 0.6 : 1,
    cursor: opts.readOnly || opts.disabled ? "default" : "pointer",
    background: opts.isSelected ? "#2a2a2a" : "transparent",
  };
}

function cardStyle(opts: { conflicted: boolean; isSelected: boolean; readOnly: boolean }): CSSProperties {
  return {
    border: opts.conflicted ? "1px solid #e8b339" : opts.isSelected ? "1px solid #7a7a7a" : "1px solid #444",
    background: opts.conflicted ? "#3a2f16" : opts.isSelected ? "#2a2a2a" : "#1c1c1c",
    opacity: opts.isSelected ? 0.7 : 1,
    borderRadius: 4,
    padding: "0.35rem 0.5rem",
    fontSize: "0.85rem",
    cursor: opts.readOnly ? "default" : "pointer",
    display: "grid",
    gap: "0.25rem",
  };
}

function emptySlotStyle(readOnly: boolean, hasSelection: boolean): CSSProperties {
  return {
    border: "1px dashed #333",
    borderRadius: 4,
    padding: "0.35rem 0.5rem",
    fontSize: "0.8rem",
    opacity: 0.5,
    cursor: readOnly || !hasSelection ? "default" : "pointer",
    minHeight: "1.4rem",
  };
}

export function SetupBoard({
  raidId,
  roster,
  otherCharacters,
  assignments,
  conflictedAssignmentIds,
  busyElsewhere,
  initialNotes,
  readOnly,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<CharRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [roleFilter, setRoleFilter] = useState<Set<CharRole>>(new Set());
  const [externalSearch, setExternalSearch] = useState("");
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [notesError, setNotesError] = useState<string | null>(null);
  const [notesPending, startNotesTransition] = useTransition();

  const characterInfoById = useMemo(() => {
    const map = new Map<string, RosterCharacter>();
    for (const c of [...roster, ...otherCharacters]) map.set(c.characterId, c);
    return map;
  }, [roster, otherCharacters]);

  const rosterByUser = useMemo(() => groupByUser(roster), [roster]);
  const otherByUser = useMemo(() => groupByUser(otherCharacters), [otherCharacters]);

  const assignmentByCharacterId = useMemo(() => {
    const map = new Map<string, Assignment>();
    for (const a of assignments) map.set(a.characterId, a);
    return map;
  }, [assignments]);

  // Klíčováno na hráče, ne na postavu — za jednoho hráče nejde jít dvěma
  // postavami současně, takže busy je celý hráč, i kdyby se to zjistilo přes
  // jen jednu jeho konkrétní postavu.
  const busyElsewhereByUserId = useMemo(() => {
    const map = new Map<string, BusyElsewhere>();
    for (const b of busyElsewhere) map.set(b.userId, b);
    return map;
  }, [busyElsewhere]);

  /** Kterou postavu má který hráč v tomto raidu obsazenou — včetně toho, co je právě VYBRANÉ
   * (ne jen už uložené), ať ostatní alty hned zešednou i před samotným přiřazením. */
  const reservedCharacterIdByUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of assignments) map.set(a.userId, a.characterId);
    if (selected) {
      const info = characterInfoById.get(selected);
      if (info) map.set(info.userId, selected);
    }
    return map;
  }, [assignments, selected, characterInfoById]);

  const conflictedSet = useMemo(() => new Set(conflictedAssignmentIds), [conflictedAssignmentIds]);
  const conflictedAssignments = useMemo(
    () => assignments.filter((a) => conflictedSet.has(a.id)),
    [assignments, conflictedSet],
  );

  const groupSlotMap = useMemo(() => {
    const map = new Map<string, Assignment>();
    for (const a of assignments) {
      if (a.status === "CONFIRMED" && a.groupNo !== null && a.slotNo !== null) {
        map.set(`${a.groupNo}-${a.slotNo}`, a);
      }
    }
    return map;
  }, [assignments]);

  const benchList = useMemo(() => assignments.filter((a) => a.status === "BENCH"), [assignments]);

  const filteredRoster = useMemo(
    () => (roleFilter.size === 0 ? roster : roster.filter((c) => roleFilter.has(c.characterRole))),
    [roster, roleFilter],
  );

  const filteredOther = useMemo(() => {
    const q = externalSearch.trim().toLowerCase();
    if (!q) return otherCharacters;
    return otherCharacters.filter(
      (c) => c.characterName.toLowerCase().includes(q) || c.displayName.toLowerCase().includes(q),
    );
  }, [otherCharacters, externalSearch]);

  function runAction(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        setSelected(null);
        setSelectedRole(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Něco se pokazilo.");
      }
    });
  }

  function toggleRoleFilter(role: CharRole) {
    setRoleFilter((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  }

  function handleSelectCharacter(characterId: string, disabled: boolean) {
    if (readOnly || disabled) return;
    setError(null);
    if (selected === characterId) {
      setSelected(null);
      setSelectedRole(null);
      return;
    }
    const info = characterInfoById.get(characterId);
    const existing = assignmentByCharacterId.get(characterId);
    setSelected(characterId);
    setSelectedRole(existing?.roleInRaid ?? info?.characterRole ?? null);
  }

  function handleSlotClick(groupNo: number, slotNo: number) {
    if (readOnly) return;
    const targetAssignment = groupSlotMap.get(`${groupNo}-${slotNo}`);

    if (!selected) {
      if (targetAssignment) handleSelectCharacter(targetAssignment.characterId, false);
      return;
    }

    const info = characterInfoById.get(selected);
    if (!info) return;

    if (!targetAssignment) {
      runAction(() =>
        assignToGroup(raidId, selected, info.userId, groupNo, slotNo, selectedRole ?? undefined),
      );
      return;
    }
    if (targetAssignment.characterId === selected) {
      setSelected(null);
      setSelectedRole(null);
      return;
    }
    const selectedAssignment = assignmentByCharacterId.get(selected);
    if (!selectedAssignment) {
      setError(`Slot ${slotNo} ve skupině ${groupNo} je obsazený — vyber prázdný slot.`);
      return;
    }
    runAction(() => swapAssignments(raidId, selected, targetAssignment.characterId));
  }

  function handleBenchZoneClick() {
    if (readOnly || !selected) return;
    const info = characterInfoById.get(selected);
    if (!info) return;
    runAction(() => benchCharacter(raidId, selected, info.userId, selectedRole ?? undefined));
  }

  function handleRemove(characterId: string) {
    if (readOnly) return;
    runAction(() => removeAssignment(raidId, characterId));
  }

  function handleRoleChange(characterId: string, role: CharRole) {
    if (readOnly) return;
    runAction(() => setAssignmentRole(raidId, characterId, role));
  }

  function handleSaveNotes() {
    setNotesError(null);
    startNotesTransition(async () => {
      try {
        await updateSetupNotes(raidId, notes);
      } catch (e) {
        setNotesError(e instanceof Error ? e.message : "Něco se pokazilo.");
      }
    });
  }

  function renderRosterEntry(c: RosterCharacter, siblingsMap: Map<string, RosterCharacter[]>) {
    const isSelected = selected === c.characterId;
    const busy = busyElsewhereByUserId.get(c.userId);
    // Zešedne i postava, která už JE přiřazená/benchnutá (ne jen její sourozenci) —
    // dál se s ní manipuluje přes kartu v mřížce/na benchi, ne přes roster. Stejně
    // tak VŠECHNY postavy hráče, který má CONFIRMED postavu v jiném časově
    // překrývajícím se raidu — za jednoho hráče nejde jít dvěma postavami
    // současně, takže busy je celý hráč, ne jen ta konkrétní postava, přes
    // kterou se to zjistilo. Výjimka: dokud je právě "vybraná", zůstává
    // klikatelná kvůli deselectu.
    const reservedBy = reservedCharacterIdByUserId.get(c.userId);
    const disabled = (reservedBy !== undefined || Boolean(busy)) && !isSelected;
    const currentAssignment = assignmentByCharacterId.get(c.characterId);
    return (
      <div
        key={c.characterId}
        onClick={() => handleSelectCharacter(c.characterId, disabled)}
        style={rosterEntryStyle({ disabled, isSelected, readOnly })}
        title={
          busy
            ? `Hráč obsazen v ${busy.raidInstance} (${formatTimeRange(busy.startsAt, busy.endsAt)})`
            : undefined
        }
      >
        <div>
          <strong>{c.characterName}</strong>{" "}
          <span style={{ opacity: 0.7 }}>
            ({c.characterClass}, {c.characterRole})
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <PlayerTag displayName={c.displayName} siblings={siblingsMap.get(c.userId) ?? []} />
          {currentAssignment && (
            <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>
              {currentAssignment.status === "CONFIRMED"
                ? `skupina ${currentAssignment.groupNo}/${currentAssignment.slotNo}`
                : "bench"}
            </span>
          )}
        </div>
        {busy && !currentAssignment && (
          <div style={{ fontSize: "0.75rem", color: "#e8b339" }}>
            ⛔ hráč obsazen v {busy.raidInstance}
          </div>
        )}
      </div>
    );
  }

  function renderAssignedCard(a: Assignment, onCardClick: () => void) {
    const info = characterInfoById.get(a.characterId);
    const conflicted = conflictedSet.has(a.id);
    const isSelected = selected === a.characterId;
    return (
      <div
        key={a.characterId}
        onClick={onCardClick}
        style={cardStyle({ conflicted, isSelected, readOnly })}
        title={conflicted ? "Konflikt: hráč má absenci pokrývající tento raid." : undefined}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.4rem" }}>
          <span>
            {conflicted && "⚠ "}
            <strong>{info?.characterName ?? "?"}</strong>
            {info && (
              <>
                {" "}
                <PlayerTag displayName={info.displayName} siblings={rosterByUser.get(info.userId) ?? []} />
              </>
            )}
          </span>
          {!readOnly && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRemove(a.characterId);
              }}
              disabled={isPending}
              style={{ fontSize: "0.75rem" }}
            >
              ×
            </button>
          )}
        </div>
        {!readOnly && (
          <select
            value={a.roleInRaid}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              handleRoleChange(a.characterId, e.target.value as CharRole);
            }}
            style={{ fontSize: "0.75rem" }}
          >
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        )}
      </div>
    );
  }

  function renderSlot(groupNo: number, slotNo: number) {
    const a = groupSlotMap.get(`${groupNo}-${slotNo}`);
    if (!a) {
      return (
        <div
          key={slotNo}
          onClick={() => handleSlotClick(groupNo, slotNo)}
          style={emptySlotStyle(readOnly, Boolean(selected))}
        >
          {!readOnly && selected ? `slot ${slotNo}` : ""}
        </div>
      );
    }
    return renderAssignedCard(a, () => handleSlotClick(groupNo, slotNo));
  }

  const selectedInfo = selected ? characterInfoById.get(selected) : undefined;

  return (
    <div>
      {error && <p style={{ color: "#ff6b6b" }}>{error}</p>}
      {readOnly && (
        <p style={{ opacity: 0.7 }}>Raid je uzavřený (DONE/CANCELLED) — setup je jen k nahlédnutí.</p>
      )}

      {selected && !readOnly && (
        <div
          style={{
            border: "1px solid #7a7a7a",
            borderRadius: 4,
            padding: "0.5rem 0.75rem",
            margin: "0.5rem 0 1rem",
            display: "flex",
            gap: "0.75rem",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span>
            Vybráno: <strong>{selectedInfo?.characterName}</strong>
          </span>
          <label style={{ fontSize: "0.85rem" }}>
            Role:{" "}
            <select
              value={selectedRole ?? ""}
              onChange={(e) => setSelectedRole(e.target.value as CharRole)}
            >
              {ALL_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>
            klikni na slot / bench, nebo na jinou postavu v mřížce (prohodí pozice)
          </span>
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setSelectedRole(null);
            }}
          >
            Zrušit výběr
          </button>
        </div>
      )}

      <div className="setup-columns">
        <section className="setup-col-roster">
          <h2>Přihlášené postavy ({filteredRoster.length}/{roster.length})</h2>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
            {ALL_ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => toggleRoleFilter(r)}
                style={{
                  fontSize: "0.75rem",
                  opacity: roleFilter.size === 0 || roleFilter.has(r) ? 1 : 0.4,
                }}
              >
                {r}
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gap: "0.4rem" }}>
            {filteredRoster.length === 0 && <p style={{ opacity: 0.7 }}>Nikdo neodpovídá filtru.</p>}
            {filteredRoster.map((c) => renderRosterEntry(c, rosterByUser))}
          </div>

          <h2 style={{ marginTop: "1.5rem" }}>Bench</h2>
          <div style={{ display: "grid", gap: "0.3rem" }}>
            {benchList.map((a) => renderAssignedCard(a, () => handleSelectCharacter(a.characterId, false)))}
            <div
              onClick={handleBenchZoneClick}
              style={emptySlotStyle(readOnly, Boolean(selected))}
            >
              {!readOnly && selected ? "klikni pro poslání na bench" : !readOnly ? "prázdno" : ""}
            </div>
          </div>

          <h2 style={{ marginTop: "1.5rem" }}>Absence-konflikty ({conflictedAssignments.length})</h2>
          {conflictedAssignments.length === 0 && <p style={{ opacity: 0.6 }}>Žádné.</p>}
          <div style={{ display: "grid", gap: "0.3rem" }}>
            {conflictedAssignments.map((a) => {
              const info = characterInfoById.get(a.characterId);
              return (
                <div
                  key={a.characterId}
                  style={{
                    border: "1px solid #e8b339",
                    background: "#3a2f16",
                    borderRadius: 4,
                    padding: "0.4rem 0.6rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "0.4rem",
                    fontSize: "0.85rem",
                  }}
                >
                  <span>
                    ⚠ <strong>{info?.characterName ?? "?"}</strong>{" "}
                    {info && (
                      <PlayerTag displayName={info.displayName} siblings={rosterByUser.get(info.userId) ?? []} />
                    )}{" "}
                    —{" "}
                    {a.status === "CONFIRMED" ? `skupina ${a.groupNo}, slot ${a.slotNo}` : "bench"}
                  </span>
                  {!readOnly && (
                    <button type="button" onClick={() => handleRemove(a.characterId)} disabled={isPending}>
                      Odebrat ze setupu
                    </button>
                  )}
                </div>
              );
            })}
          </div>

        </section>

        <section className="setup-col-grid">
          <h2>Mřížka (8 × {SLOTS_PER_GROUP})</h2>
          <div className="setup-grid">
            {GROUPS.map((groupNo) => {
              const filledCount = SLOTS.filter((s) => groupSlotMap.has(`${groupNo}-${s}`)).length;
              return (
                <div key={groupNo} style={{ border: "1px solid #333", borderRadius: 6, padding: "0.5rem" }}>
                  <div style={{ fontSize: "0.85rem", opacity: 0.7, marginBottom: "0.35rem" }}>
                    Skupina {groupNo} ({filledCount}/{SLOTS_PER_GROUP})
                  </div>
                  <div style={{ display: "grid", gap: "0.3rem" }}>
                    {SLOTS.map((slotNo) => renderSlot(groupNo, slotNo))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="setup-col-extra">
          <h2>Poznámky k setupu</h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            style={{ width: "100%" }}
            disabled={readOnly}
          />
          {!readOnly && (
            <div>
              <button type="button" onClick={handleSaveNotes} disabled={notesPending}>
                Uložit poznámku
              </button>
            </div>
          )}
          {notesError && <p style={{ color: "#ff6b6b" }}>{notesError}</p>}

          {!readOnly && (
            <>
              <h2 style={{ marginTop: "1.5rem" }}>
                Přidat postavu mimo přihlášené ({otherCharacters.length})
              </h2>
              <input
                placeholder="Hledat jménem postavy nebo hráče…"
                value={externalSearch}
                onChange={(e) => setExternalSearch(e.target.value)}
                style={{ width: "100%", marginBottom: "0.4rem" }}
              />
              <div style={{ display: "grid", gap: "0.3rem", maxHeight: 320, overflowY: "auto" }}>
                {filteredOther.length === 0 && <p style={{ opacity: 0.7 }}>Nic nenalezeno.</p>}
                {filteredOther.map((c) => renderRosterEntry(c, otherByUser))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
