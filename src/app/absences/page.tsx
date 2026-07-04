import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth";
import { listMyAbsences } from "./actions";
import { AbsenceForm } from "./absence-form";
import { AbsenceRow } from "./absence-row";

export default async function AbsencesPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const absences = await listMyAbsences();

  return (
    <main>
      <p>
        <Link href="/characters">← Moje postavy</Link> · <Link href="/raids">Raidy →</Link>
      </p>
      <h1>Moje absence</h1>
      <p style={{ opacity: 0.7 }}>
        Pokud máš potvrzenou postavu v raidu, který absence pokrývá, setup ji NEODEBERE — jen ji
        označí jako konfliktní a upozorní raid leadera.
      </p>

      <ul style={{ margin: "1.5rem 0", padding: 0 }}>
        {absences.length === 0 && <li style={{ listStyle: "none" }}>Zatím žádné absence.</li>}
        {absences.map((a) => (
          <AbsenceRow key={a.id} absence={a} />
        ))}
      </ul>

      <h2>Nahlásit absenci</h2>
      <AbsenceForm />
    </main>
  );
}
