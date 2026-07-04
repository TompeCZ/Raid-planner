import type { Raid } from "@/db/schema";

type RaidStatus = Raid["status"];

/**
 * Povolené ruční přechody stavů raidu (spec: signup deadline / LOCKED = ručně RL).
 * DONE a CANCELLED jsou koncové stavy.
 */
export const RAID_STATUS_TRANSITIONS: Record<RaidStatus, RaidStatus[]> = {
  DRAFT: ["OPEN", "CANCELLED"],
  OPEN: ["LOCKED", "DONE", "CANCELLED"],
  LOCKED: ["OPEN", "DONE", "CANCELLED"],
  DONE: [],
  CANCELLED: [],
};

export function canTransitionRaidStatus(from: RaidStatus, to: RaidStatus): boolean {
  return RAID_STATUS_TRANSITIONS[from].includes(to);
}

/** Popisky akčních tlačítek pro přechod do daného stavu. */
export const RAID_STATUS_ACTION_LABELS: Partial<Record<RaidStatus, string>> = {
  OPEN: "Znovu otevřít",
  LOCKED: "Uzamknout přihlášky",
  DONE: "Označit jako proběhlý",
  CANCELLED: "Zrušit raid",
};

/** Editace údajů raidu má smysl, jen dokud není v koncovém stavu. */
export function isRaidEditable(status: RaidStatus): boolean {
  return status === "DRAFT" || status === "OPEN" || status === "LOCKED";
}
