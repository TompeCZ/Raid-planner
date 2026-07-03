import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { user, type User } from "@/db/schema";

/** Discord id + zobrazované jméno vytažené z identity vrácené Supabase OAuthem. */
function discordIdentityFrom(supabaseUser: SupabaseUser) {
  const identity = supabaseUser.identities?.find((i) => i.provider === "discord");
  const discordId = identity?.id ?? (supabaseUser.user_metadata?.provider_id as string | undefined);
  const displayName =
    (supabaseUser.user_metadata?.full_name as string | undefined) ??
    (supabaseUser.user_metadata?.name as string | undefined) ??
    (supabaseUser.user_metadata?.custom_claims?.global_name as string | undefined) ??
    discordId;

  if (!discordId || !displayName) {
    throw new Error("Supabase session neobsahuje Discord identitu.");
  }
  return { discordId, displayName };
}

/**
 * Napáruje/založí App User po přihlášení přes discord_id.
 * - existuje aktivní -> vrátí ho beze změny
 * - existuje soft-deleted -> obnoví (vyčistí deleted_at)
 * - neexistuje -> založí nový
 */
async function ensureAppUser(discordId: string, displayName: string): Promise<User> {
  const [existing] = await db.select().from(user).where(eq(user.discordId, discordId)).limit(1);

  if (existing) {
    if (existing.deletedAt !== null) {
      const [restored] = await db
        .update(user)
        .set({ deletedAt: null })
        .where(eq(user.id, existing.id))
        .returning();
      return restored;
    }
    return existing;
  }

  const [created] = await db.insert(user).values({ discordId, displayName }).returning();
  return created;
}

/**
 * Vrátí App User navázaného na aktuální Supabase session (a mimochodem
 * dopáruje/obnoví řádek v `user`). `cache()` sdílí výsledek napříč Server
 * Components v rámci jednoho requestu.
 */
export const getCurrentAppUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();

  if (!supabaseUser) return null;

  const { discordId, displayName } = discordIdentityFrom(supabaseUser);
  return ensureAppUser(discordId, displayName);
});
