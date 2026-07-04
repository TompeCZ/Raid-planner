"use client";

import { useMemo, useState, useTransition } from "react";
import type { Assignment } from "@/db/schema";
import { assignToGroup, benchCharacter, removeAssignment, type RosterCharacter } from "./actions";
import { GROUP_COUNT, SLOTS_PER_GROUP } from "./setup-validation";

const GROUPS = Array.from({ length: GROUP_COUNT }, (_, i) => i + 1);

type Props = {
  raidId: string;
  roster: RosterCharacter[];
  assignments: Assignment[];
  conflictedAssignmentIds: string[];
  readOnly: boolean;
};

/** Malý tag na hráče — hover/focus ukáže popup s jeho ostatními nabídnutými postavami. */
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
      {open && (
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
          <div style={{ fontSize: "0.8rem", opacity: 0.8 }}>Nabízí do tohoto raidu:</div>
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

export function SetupBoard({ raidId, roster, assignments, conflictedAssignmentIds, readOnly }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const characterInfoById = useMemo(() => {
    const map = new Map<string, RosterCharacter>();
    for (const c of roster) map.set(c.characterId, c);
    return map;
  }, [roster]);

  const rosterByUser = useMemo(() => {
    const map = new Map<string, RosterCharacter[]>();
    for (const c of roster) {
      const list = map.get(c.userId) ?? [];
      list.push(c);
      map.set(c.userId, list);
    }
    return map;
  }, [roster]);

  const assignmentByCharacterId = useMemo(() => {
    const map = new Map<string, Assignment>();
    for (const a of assignments) map.set(a.characterId, a);
    return map;
  }, [assignments]);

  /** Kterou postavu má který hráč v TOMTO raidu obsazenou (jakýkoli status) — pro šednutí sourozenců. */
  const assignedCharacterIdByUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of assignments) map.set(a.userId, a.characterId);
    return map;
  }, [assignments]);

  const conflictedSet = useMemo(() => new Set(conflictedAssignmentIds), [conflictedAssignmentIds]);

  const groupOccupants = useMemo(() => {
    const map = new Map<number, Assignment[]>();
    for (const a of assignments) {
      if (a.status !== "CONFIRMED" || a.groupNo === null) continue;
      const list = map.get(a.groupNo) ?? [];
      list.push(a);
      map.set(a.groupNo, list);
    }
    return map;
  }, [assignments]);

  const benchList = useMemo(() => assignments.filter((a) => a.status === "BENCH"), [assignments]);

  function runAction(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        setSelected(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Něco se pokazilo.");
      }
    });
  }

  function handleSelectCharacter(characterId: string, disabled: boolean) {
    if (readOnly || disabled) return;
    setError(null);
    setSelected((cur) => (cur === characterId ? null : characterId));
  }

  function handleSlotClick(groupNo: number) {
    if (readOnly || !selected) return;
    const character = characterInfoById.get(selected);
    if (!character) return;
    runAction(() => assignToGroup(raidId, selected, character.userId, groupNo));
  }

  function handleBenchZoneClick() {
    if (readOnly || !selected) return;
    const character = characterInfoById.get(selected);
    if (!character) return;
    runAction(() => benchCharacter(raidId, selected, character.userId));
  }

  function handleRemove(characterId: string) {
    if (readOnly) return;
    runAction(() => removeAssignment(raidId, characterId));
  }

  function renderAssignedCard(a: Assignment) {
    const info = characterInfoById.get(a.characterId);
    const conflicted = conflictedSet.has(a.id);
    const isSelected = selected === a.characterId;
    return (
      <div
        key={a.characterId}
        onClick={() => handleSelectCharacter(a.characterId, false)}
        style={{
          border: conflicted ? "1px solid #e8b339" : "1px solid #444",
          background: isSelected ? "#2a3a4a" : conflicted ? "#3a2f16" : "#1c1c1c",
          borderRadius: 4,
          padding: "0.35rem 0.5rem",
          fontSize: "0.85rem",
          cursor: readOnly ? "default" : "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.4rem",
        }}
        title={conflicted ? "Konflikt: hráč má absenci pokrývající tento raid." : undefined}
      >
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
    );
  }

  return (
    <div>
      {error && <p style={{ color: "#ff6b6b" }}>{error}</p>}
      {readOnly && (
        <p style={{ opacity: 0.7 }}>Raid je uzavřený (DONE/CANCELLED) — setup je jen k nahlédnutí.</p>
      )}
      {!readOnly && (
        <p style={{ opacity: 0.7, fontSize: "0.9rem" }}>
          Klikni na postavu v seznamu, pak na slot ve skupině (nebo na Bench).
        </p>
      )}

      <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", alignItems: "flex-start" }}>
        <section style={{ flex: "1 1 300px" }}>
          <h2>Přihlášené postavy ({roster.length})</h2>
          <div style={{ display: "grid", gap: "0.4rem" }}>
            {roster.length === 0 && <p style={{ opacity: 0.7 }}>Zatím se nikdo nepřihlásil.</p>}
            {roster.map((c) => {
              const assignedElsewhereByUser = assignedCharacterIdByUserId.get(c.userId);
              const disabled =
                assignedElsewhereByUser !== undefined && assignedElsewhereByUser !== c.characterId;
              const isSelected = selected === c.characterId;
              const currentAssignment = assignmentByCharacterId.get(c.characterId);
              return (
                <div
                  key={c.characterId}
                  onClick={() => handleSelectCharacter(c.characterId, disabled)}
                  style={{
                    border: "1px solid #444",
                    borderRadius: 4,
                    padding: "0.4rem 0.6rem",
                    fontSize: "0.9rem",
                    opacity: disabled ? 0.4 : 1,
                    cursor: readOnly || disabled ? "default" : "pointer",
                    background: isSelected ? "#2a3a4a" : "transparent",
                  }}
                >
                  <div>
                    <strong>{c.characterName}</strong>{" "}
                    <span style={{ opacity: 0.7 }}>
                      ({c.characterClass}, {c.characterRole})
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <PlayerTag displayName={c.displayName} siblings={rosterByUser.get(c.userId) ?? []} />
                    {currentAssignment && (
                      <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>
                        {currentAssignment.status === "CONFIRMED"
                          ? `skupina ${currentAssignment.groupNo}`
                          : "bench"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section style={{ flex: "2 1 480px" }}>
          <h2>Mřížka (8 × 5)</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "0.75rem",
            }}
          >
            {GROUPS.map((groupNo) => {
              const occupants = groupOccupants.get(groupNo) ?? [];
              const freeSlots = SLOTS_PER_GROUP - occupants.length;
              return (
                <div key={groupNo} style={{ border: "1px solid #333", borderRadius: 6, padding: "0.5rem" }}>
                  <div style={{ fontSize: "0.85rem", opacity: 0.7, marginBottom: "0.35rem" }}>
                    Skupina {groupNo} ({occupants.length}/{SLOTS_PER_GROUP})
                  </div>
                  <div style={{ display: "grid", gap: "0.3rem" }}>
                    {occupants.map(renderAssignedCard)}
                    {Array.from({ length: Math.max(freeSlots, 0) }, (_, i) => (
                      <div
                        key={`empty-${groupNo}-${i}`}
                        onClick={() => handleSlotClick(groupNo)}
                        style={{
                          border: "1px dashed #333",
                          borderRadius: 4,
                          padding: "0.35rem 0.5rem",
                          fontSize: "0.8rem",
                          opacity: 0.5,
                          cursor: readOnly || !selected ? "default" : "pointer",
                          minHeight: "1.4rem",
                        }}
                      >
                        {!readOnly && selected ? "klikni pro přiřazení" : ""}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <h2 style={{ marginTop: "1.5rem" }}>Bench</h2>
          <div
            onClick={handleBenchZoneClick}
            style={{
              border: "1px dashed #333",
              borderRadius: 6,
              padding: "0.5rem",
              display: "grid",
              gap: "0.3rem",
              cursor: readOnly || !selected ? "default" : "pointer",
              minHeight: "2.5rem",
            }}
          >
            {benchList.length === 0 && (
              <span style={{ opacity: 0.5, fontSize: "0.85rem" }}>
                {!readOnly && selected ? "klikni pro poslání na bench" : "Nikdo na benchi."}
              </span>
            )}
            {benchList.map(renderAssignedCard)}
          </div>
        </section>
      </div>
    </div>
  );
}
