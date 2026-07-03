import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAppUser } from "@/lib/auth";

/**
 * Base URL pro redirect po OAuth. `origin` z requestu je křehký — když dev
 * server běží na -H 0.0.0.0, origin je "http://0.0.0.0:3000" a redirect je
 * neplatný. Preferuje NEXT_PUBLIC_SITE_URL, ale ignoruje ji, pokud je
 * prázdná nebo obsahuje 0.0.0.0 (typicky nedopatřením zkopírovaná dev hodnota).
 */
function resolveRedirectBase(origin: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl && !siteUrl.includes("0.0.0.0")) {
    return siteUrl;
  }
  return origin;
}

/** OAuth redirect z Discordu/Supabase — vymění `code` za session cookie. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/characters";
  const base = resolveRedirectBase(origin);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Založí/napáruje App User (match na discord_id) hned při prvním loginu.
      await getCurrentAppUser();
      return NextResponse.redirect(`${base}${next}`);
    }
  }

  return NextResponse.redirect(`${base}/login?error=auth`);
}
