import { CLASS_COLORS } from "@/app/characters/constants";

/** Barva podle WoW třídy postavy, nebo undefined (Priest má vždy neutrální rámeček, viz CLASS_COLORS). */
export function classColor(characterClass: string | null): string | undefined {
  if (!characterClass) return undefined;
  return (CLASS_COLORS as Record<string, string>)[characterClass];
}

/**
 * Sdílený vizuál raid-značky (modrá tečka + pilulka) — kalendář i dashboard,
 * ať vypadají stejně. `full` = vždy ukázat název (dashboard, detail dne),
 * bez `full` značka na úzkém displeji zkolabuje na jen tečku (mřížka měsíce,
 * kde je málo místa) — viz `.cal-raid-marker` v globals.css.
 */
export function RaidMarkerPill({
  instance,
  title,
  full,
}: {
  instance: string;
  title?: string;
  full?: boolean;
}) {
  return (
    <span
      className={full ? "cal-raid-marker cal-raid-marker--full" : "cal-raid-marker"}
      title={title ?? instance}
    >
      <span className="dot" />
      <span className="text">{instance}</span>
    </span>
  );
}

/** Sdílený vizuál absence-chipu (jméno, rámeček barvený podle třídy hlavní postavy). */
export function AbsenceChip({
  displayName,
  characterClass,
}: {
  displayName: string;
  characterClass: string | null;
}) {
  return (
    <span
      style={{
        display: "inline-block",
        border: "1px solid #555",
        borderRadius: 12,
        padding: "0.15rem 0.5rem",
        background: "#1c1c1c",
        color: classColor(characterClass) ?? "#e6e6e6",
        fontSize: "0.85rem",
      }}
    >
      {displayName}
    </span>
  );
}
