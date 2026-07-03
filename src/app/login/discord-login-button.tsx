"use client";

import { createClient } from "@/lib/supabase/client";

export function DiscordLoginButton() {
  async function signIn() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <button
      onClick={signIn}
      style={{
        background: "#5865F2",
        color: "white",
        border: "none",
        borderRadius: 6,
        padding: "0.75rem 1.5rem",
        fontSize: "1rem",
        fontWeight: 600,
      }}
    >
      Přihlásit se přes Discord
    </button>
  );
}
