import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { canManageRaids, getCurrentAppUser } from "@/lib/auth";
import { getSetupData } from "./actions";
import { SetupBoard } from "./setup-board";
import { isRaidEditable } from "../../raid-status";

export default async function SetupPage({ params }: { params: Promise<{ raidId: string }> }) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (!canManageRaids(appUser)) redirect("/raids");

  const { raidId } = await params;
  const data = await getSetupData(raidId).catch(() => null);
  if (!data) notFound();

  const { raid, roster, otherCharacters, assignments, conflictedAssignmentIds, busyElsewhere, absentUserIds } =
    data;

  return (
    <main className="wide">
      <p>
        <Link href={`/raids/${raidId}`}>← Zpět na raid</Link>
      </p>
      <h1>Setup: {raid.instance}</h1>
      <p style={{ opacity: 0.7 }}>
        {raid.startsAt.toLocaleString("cs-CZ")} – {raid.endsAt.toLocaleString("cs-CZ")} · stav{" "}
        {raid.status}
      </p>

      <SetupBoard
        raidId={raidId}
        roster={roster}
        otherCharacters={otherCharacters}
        assignments={assignments}
        conflictedAssignmentIds={conflictedAssignmentIds}
        busyElsewhere={busyElsewhere}
        absentUserIds={absentUserIds}
        initialNotes={raid.notes}
        readOnly={!isRaidEditable(raid.status)}
        canPublishToDiscord={raid.status === "LOCKED"}
      />
    </main>
  );
}
