import Link from "next/link";
import { redirect } from "next/navigation";
import { canManageRaids, getCurrentAppUser } from "@/lib/auth";
import { findConflictedRaidIds } from "@/lib/absence-conflicts";
import { listActiveRaids } from "./actions";
import { RaidForm } from "./raid-form";

export default async function RaidsPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const raids = await listActiveRaids();
  const now = new Date();
  const isManager = canManageRaids(appUser);
  const conflictedRaidIds = isManager
    ? await findConflictedRaidIds(raids.map((r) => r.id))
    : new Set<string>();

  return (
    <main>
      <p>
        <Link href="/">← Dashboard</Link> · <Link href="/characters">Moje postavy</Link> ·{" "}
        <Link href="/absences">Moje absence</Link>
      </p>
      <h1>Aktivní raidy</h1>

      <ul style={{ margin: "1.5rem 0", padding: 0 }}>
        {raids.length === 0 && <li style={{ listStyle: "none" }}>Žádné aktivní raidy.</li>}
        {raids.map((r) => (
          <li key={r.id} style={{ listStyle: "none", padding: "0.5rem 0", borderBottom: "1px solid #333" }}>
            <Link href={`/raids/${r.id}`}>
              <strong>{r.instance}</strong> — {r.startsAt.toLocaleString("cs-CZ")}
            </Link>
            <span style={{ opacity: 0.7 }}>
              {" "}
              ({r.signupMode}, kapacita {r.capacity})
              {r.status === "LOCKED" && " · uzamčeno"}
              {r.status === "DONE" && " · proběhl (DONE)"}
              {r.status === "CANCELLED" && " · zrušeno"}
            </span>
            {r.endsAt < now && r.status !== "DONE" && r.status !== "CANCELLED" && (
              <strong style={{ color: "#e8b339" }}> · už proběhl</strong>
            )}
            {conflictedRaidIds.has(r.id) && (
              <strong style={{ color: "#ff6b6b" }}> · ⚠ absence-konflikt v setupu</strong>
            )}
          </li>
        ))}
      </ul>

      {isManager && (
        <>
          <h2>Vytvořit raid</h2>
          <RaidForm />
        </>
      )}
    </main>
  );
}
