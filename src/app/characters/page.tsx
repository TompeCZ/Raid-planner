import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth";
import { listMyCharacters } from "./actions";
import { CharacterForm } from "./character-form";
import { CharacterRow } from "./character-row";
import { LogoutButton } from "./logout-button";

export default async function CharactersPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const characters = await listMyCharacters();

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Moje postavy</h1>
        <LogoutButton />
      </div>
      <p style={{ opacity: 0.7 }}>Přihlášen jako {appUser.displayName}</p>
      <p>
        <Link href="/raids">Raidy →</Link> · <Link href="/absences">Moje absence →</Link>
      </p>

      <ul style={{ margin: "1.5rem 0", padding: 0 }}>
        {characters.length === 0 && <li style={{ listStyle: "none" }}>Zatím žádné postavy.</li>}
        {characters.map((c) => (
          <CharacterRow key={c.id} character={c} />
        ))}
      </ul>

      <h2>Přidat postavu</h2>
      <CharacterForm />
    </main>
  );
}
