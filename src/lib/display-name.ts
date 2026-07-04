/**
 * Odvozené zobrazovací jméno hráče pro ostatní — hlavní (nesmazaná) postava,
 * jinak fallback na Discord displayName z tabulky `user`. Volající je
 * zodpovědný za to, že `mainCharacterName` pochází z dotazu filtrovaného na
 * `isMain AND deletedAt IS NULL` (viz getMainCharacterNamesByUserId).
 */
export function resolveDisplayName(
  user: { displayName: string },
  mainCharacterName: string | null,
): string {
  return mainCharacterName ?? user.displayName;
}
