import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { canAccessNotes, getCurrentAppUser } from "@/lib/auth";
import { classColor } from "@/app/calendar/day-markers";
import { formatMetricPct } from "@/lib/attendance-stats";
import { parsePeriodFilter, type PeriodFilterParams } from "@/lib/period-filter";
import { getDossierData } from "./actions";
import { RankSelect } from "./rank-select";
import { NoteForm } from "./note-form";
import { NoteStream } from "./note-stream";

const METRIC_LABELS = [
  { key: "attendance", label: "Docházka" },
  { key: "noShow", label: "No-show" },
  { key: "absenceFrequency", label: "Frekvence absencí" },
  { key: "played", label: "Played" },
  { key: "punctuality", label: "Punktualita (víc = častěji pozdě/dřív)" },
] as const;

export default async function RosterDossierPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<PeriodFilterParams>;
}) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (!canAccessNotes(appUser)) redirect("/");

  const { userId } = await params;
  const queryParams = await searchParams;
  const filter = parsePeriodFilter(queryParams);

  const data = await getDossierData(userId, filter).catch(() => null);
  if (!data) notFound();

  return (
    <main>
      <p>
        <Link href="/roster">← Roster</Link>
      </p>
      <h1 style={{ color: classColor(data.mainCharacterClass) ?? undefined }}>{data.displayName}</h1>
      <p>
        Rank: <RankSelect userId={data.subjectUserId} initialRank={data.guildRank} />
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "0.6rem",
          margin: "1rem 0",
        }}
      >
        {METRIC_LABELS.map(({ key, label }) => (
          <div key={key} style={{ border: "1px solid #333", borderRadius: 6, padding: "0.5rem" }}>
            <div style={{ fontSize: "0.8rem", opacity: 0.7 }}>{label}</div>
            <div style={{ fontSize: "1.1rem" }}>{formatMetricPct(data.stats[key])}</div>
          </div>
        ))}
      </div>

      <h2>Nová poznámka</h2>
      <NoteForm
        subjectUserId={data.subjectUserId}
        characterOptions={data.characterOptions}
        raidOptions={data.raidOptions}
      />

      <NoteStream notes={data.notes} currentUserId={data.currentUserId} isAdmin={appUser.role === "ADMIN"} />
    </main>
  );
}
