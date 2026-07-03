import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Supabase klient pro server (Server Components, Route Handlers, Server Actions).
 * Slouží VÝHRADNĚ k ověření identity (auth) — přístup k datům jde přes Drizzle.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // setAll volané ze Server Componenty (ne akce/route handler) — middleware
            // session stejně obnoví, tohle selhání lze bezpečně ignorovat.
          }
        },
      },
    },
  );
}
