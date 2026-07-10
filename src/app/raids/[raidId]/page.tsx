import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { canManageRaids, getCurrentAppUser } from "@/lib/auth";
import { getRaidPageData } from "./actions";
import { SignupForm } from "./signup-form";
import { RaidHeader } from "./raid-header";
import { AttendancePanel } from "./attendance-panel";
import { AttendanceSummaryBar } from "./attendance-summary-bar";

export default async function RaidDetailPage({
  params,
}: {
  params: Promise<{ raidId: string }>;
}) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const { raidId } = await params;
  const data = await getRaidPageData(raidId).catch(() => null);
  if (!data) notFound();

  const { raid, myCharacters, mySignup, mySignupCharacterIds, roster, attendance } = data;

  return (
    <main>
      <p>
        <Link href="/raids">← Zpět na raidy</Link>
      </p>
      <RaidHeader raid={raid} canManage={canManageRaids(appUser)} />

      {canManageRaids(appUser) && (
        <p>
          <Link href={`/raids/${raid.id}/setup`}>Setup builder →</Link>
        </p>
      )}

      {raid.status === "OPEN" ? (
        <>
          <h2>Přihlásit se</h2>
          <SignupForm
            // Vynutí remount při každé změně signupu ze serveru — jinak si formulář
            // po submitu/withdraw drží starý lokální stav (status/vybrané postavy).
            key={`${mySignup?.id ?? "new"}-${mySignup?.status ?? ""}-${mySignupCharacterIds.join(",")}`}
            raidId={raid.id}
            signupMode={raid.signupMode}
            characters={myCharacters}
            initialStatus={mySignup?.status}
            initialCharacterIds={mySignupCharacterIds}
            hasExistingSignup={Boolean(mySignup)}
          />
        </>
      ) : (
        <p style={{ opacity: 0.7 }}>Raid není otevřený pro přihlašování (stav {raid.status}).</p>
      )}

      <h2>Přihlášení hráči</h2>
      <ul style={{ margin: "1rem 0", padding: 0 }}>
        {roster.length === 0 && <li style={{ listStyle: "none" }}>Zatím nikdo.</li>}
        {roster.map((r) => (
          <li key={r.signupId} style={{ listStyle: "none" }}>
            {r.displayName} — {r.status}
            {r.characterNames.length > 0 ? ` (${r.characterNames.join(", ")})` : ""}
          </li>
        ))}
      </ul>

      {raid.status === "DONE" && (
        <>
          <h2>Docházka</h2>
          <AttendanceSummaryBar attendance={attendance} />
          <AttendancePanel raidId={raid.id} attendance={attendance} readOnly={!canManageRaids(appUser)} />
        </>
      )}
    </main>
  );
}
