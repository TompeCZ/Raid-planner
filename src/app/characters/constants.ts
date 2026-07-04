export const WOW_CLASSES = [
  "Warrior",
  "Paladin",
  "Hunter",
  "Rogue",
  "Priest",
  "Shaman",
  "Mage",
  "Warlock",
  "Druid",
] as const;

/** Standardní WoW class barvy. Priest je bílý — proto v UI vždy jednotný
 * neutrální rámeček kolem chipu, ne barevný podle třídy, jinak by na světlém
 * pozadí zmizel. */
export const CLASS_COLORS: Record<(typeof WOW_CLASSES)[number], string> = {
  Warrior: "#C79C6E",
  Paladin: "#F58CBA",
  Hunter: "#ABD473",
  Rogue: "#FFF569",
  Priest: "#FFFFFF",
  Shaman: "#0070DE",
  Mage: "#69CCF0",
  Warlock: "#9482C9",
  Druid: "#FF7D0A",
};
