/**
 * Emoji pro postavu v Discord embedu (setup publikace). Config-driven: pokud
 * je pro danou WoW třídu nastavené custom class emoji v env
 * (`DISCORD_EMOJI_<TŘÍDA>`, formát `<:name:id>` — Discord ho vykreslí i uvnitř
 * embedu), použije se přednostně. Bez configu (výchozí, PLNOHODNOTNÝ stav, ne
 * dočasná berlička — viz CLAUDE.md) padá na Unicode emoji podle role, takže
 * appka funguje i bez jediné vyplněné env proměnné.
 *
 * TODO(class-emoji): až budou class emoji nahrané na produkčním Discord
 * serveru, vyplnit DISCORD_EMOJI_* v env — beze změny kódu.
 */
import { charRole } from "@/db/schema";
import { WOW_CLASSES } from "@/app/characters/constants";

export type CharRole = (typeof charRole.enumValues)[number];

const CLASS_ENV_KEY: Record<(typeof WOW_CLASSES)[number], string> = {
  Warrior: "DISCORD_EMOJI_WARRIOR",
  Paladin: "DISCORD_EMOJI_PALADIN",
  Hunter: "DISCORD_EMOJI_HUNTER",
  Rogue: "DISCORD_EMOJI_ROGUE",
  Priest: "DISCORD_EMOJI_PRIEST",
  Shaman: "DISCORD_EMOJI_SHAMAN",
  Mage: "DISCORD_EMOJI_MAGE",
  Warlock: "DISCORD_EMOJI_WARLOCK",
  Druid: "DISCORD_EMOJI_DRUID",
};

const ROLE_FALLBACK_EMOJI: Record<CharRole, string> = {
  TANK: "🛡️",
  HEALER: "✨",
  MELEE: "⚔️",
  RANGED: "🏹",
};

export function emojiFor(characterClass: string, role: CharRole): string {
  const envKey = (CLASS_ENV_KEY as Record<string, string | undefined>)[characterClass];
  const custom = envKey ? process.env[envKey] : undefined;
  return custom && custom.trim() !== "" ? custom : ROLE_FALLBACK_EMOJI[role];
}
