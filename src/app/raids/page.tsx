import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth";
import { listOpenRaids } from "./actions";
import { RaidForm } from "./raid-form";

export default async function RaidsPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const raids = await listOpenRaids();

  return (
    <main>
      <p>
        <Link href="/characters">← Moje postavy</Link>
      </p>
      <h1>Otevřené raidy</h1>

      <ul style={{ margin: "1.5rem 0", padding: 0 }}>
        {raids.length === 0 && <li style={{ listStyle: "none" }}>Žádné otevřené raidy.</li>}
        {raids.map((r) => (
          <li key={r.id} style={{ listStyle: "none", padding: "0.5rem 0", borderBottom: "1px solid #333" }}>
            <Link href={`/raids/${r.id}`}>
              <strong>{r.instance}</strong> — {r.startsAt.toLocaleString("cs-CZ")}
            </Link>
            <span style={{ opacity: 0.7 }}>
              {" "}
              ({r.signupMode}, kapacita {r.capacity})
            </span>
          </li>
        ))}
      </ul>

      <h2>Vytvořit raid</h2>
      <RaidForm />
    </main>
  );
}
