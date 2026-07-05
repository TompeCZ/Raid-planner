/**
 * Content zprávy oznámení raidu na Discord. Čistá funkce (žádná DB) — pinguje
 * se `@here` v `content` (ne v embedu, ten nepinguje), počet přihlášených je
 * statický k okamžiku odeslání (viz raids/[raidId]/actions.ts#announceRaidToDiscord).
 */
export function buildAnnouncementContent(input: {
  instance: string;
  dateLabel: string;
  signupCount: number;
  raidUrl: string;
}): string {
  return `@here **${input.instance}** — ${input.dateLabel} · přihlášeno: ${input.signupCount} · ${input.raidUrl}`;
}
