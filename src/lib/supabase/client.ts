import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase klient pro prohlížeč — používá se pouze pro spuštění OAuth
 * (signInWithOAuth / signOut). K datům z klienta nikdy nepřistupujeme.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
