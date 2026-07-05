/**
 * Čisté (bez DB) stavební kameny Discord publikace setupu — DB dotazy a
 * shromáždění dat žijí v `actions.ts#publishSetupToDiscord`, tenhle modul jen
 * skládá embed/content/diff z už načtených dat. Odděleno kvůli testovatelnosti
 * (viz CLAUDE.md konvence pro `server-only` řetězec).
 */
import { charRole } from "@/db/schema";
import type { DiscordEmbed, DiscordEmbedField } from "@/lib/discord-webhook";
import { emojiFor } from "@/lib/discord-emoji";

export type CharRole = (typeof charRole.enumValues)[number];

export type SetupEmbedMember = {
  characterName: string;
  characterClass: string;
  role: CharRole;
};

export type SetupEmbedGroup = {
  groupNo: number;
  members: SetupEmbedMember[];
};

export type SetupEmbedInput = {
  raidInstance: string;
  raidDateLabel: string;
  groups: SetupEmbedGroup[];
  bench: SetupEmbedMember[];
  late: { name: string }[];
  absence: { name: string }[];
};

const EMBED_COLOR = 0x5865f2;

function memberLine(m: SetupEmbedMember): string {
  return `${emojiFor(m.characterClass, m.role)} ${m.characterName}`;
}

/** Embed setupu — G1..G8 jako inline fieldy (Discord si je sám poskládá 3 na řádek), pak bench/late/absence bloky. */
export function buildSetupEmbed(input: SetupEmbedInput): DiscordEmbed {
  const fields: DiscordEmbedField[] = input.groups
    .filter((g) => g.members.length > 0)
    .map((g) => ({
      name: `Skupina ${g.groupNo}`,
      value: g.members.map(memberLine).join("\n"),
      inline: true,
    }));

  if (input.bench.length > 0) {
    fields.push({
      name: "Bench",
      value: input.bench.map(memberLine).join("\n"),
      inline: false,
    });
  }
  if (input.late.length > 0) {
    fields.push({
      name: "Late",
      value: input.late.map((l) => `🕐 ${l.name}`).join("\n"),
      inline: false,
    });
  }
  if (input.absence.length > 0) {
    fields.push({
      name: "Absence",
      value: input.absence.map((a) => a.name).join("\n"),
      inline: false,
    });
  }

  return {
    title: `${input.raidInstance} — ${input.raidDateLabel}`,
    color: EMBED_COLOR,
    fields,
    footer: { text: "Odesláno přes Raid Planner" },
  };
}

/** Content zprávy (pingy) — CONFIRMED + BENCH + LATE hráči jako `<@discordId>`. Absence se nepinguje. */
export function buildSetupPingContent(participantDiscordIds: string[]): string {
  return participantDiscordIds.map((id) => `<@${id}>`).join(" ");
}

export type DiscordSetupSnapshotEntry = {
  userId: string;
  discordId: string;
  name: string;
  state: "CONFIRMED" | "BENCH" | "LATE";
  groupNo: number | null;
};

export type SetupSnapshotDiff = {
  added: DiscordSetupSnapshotEntry[];
  removed: DiscordSetupSnapshotEntry[];
};

/** Diff dvou snapshotů podle userId — nezávisí na state/groupNo, jen na přítomnosti hráče. */
export function diffSetupSnapshots(
  previous: DiscordSetupSnapshotEntry[],
  next: DiscordSetupSnapshotEntry[],
): SetupSnapshotDiff {
  const previousIds = new Set(previous.map((e) => e.userId));
  const nextIds = new Set(next.map((e) => e.userId));
  return {
    added: next.filter((e) => !previousIds.has(e.userId)),
    removed: previous.filter((e) => !nextIds.has(e.userId)),
  };
}

/** Content změnové zprávy (ČÁST C) — fire-and-forget, neukládá se, jen zapinguje přidané/stažené. */
export function buildSetupChangeNoticeContent(diff: SetupSnapshotDiff): string {
  const lines = [
    ...diff.added.map((e) => `➕ <@${e.discordId}>`),
    ...diff.removed.map((e) => `➖ <@${e.discordId}>`),
  ];
  return `🔄 Změna v sestupu:\n${lines.join("\n")}`;
}
