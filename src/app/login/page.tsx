import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth";
import { DiscordLoginButton } from "./discord-login-button";

export default async function LoginPage() {
  const appUser = await getCurrentAppUser();
  if (appUser) redirect("/characters");

  return (
    <main>
      <h1>Raid Planner</h1>
      <p>Přihlas se přes Discord účet guildy.</p>
      <DiscordLoginButton />
    </main>
  );
}
