import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth";
import { formatRaidDateTimeLabel } from "@/lib/local-date";
import { formatMetricPct } from "@/lib/attendance-stats";
import { parsePeriodFilter, type PeriodFilterParams } from "@/lib/period-filter";
import { PeriodFilterBar } from "@/app/period-filter-bar";
import { getPlayerStats } from "./actions";

const METRIC_LABELS = [
  { key: "attendance", label: "Docházka" },
  { key: "noShow", label: "No-show" },
  { key: "absenceFrequency", label: "Frekvence absencí" },
  { key: "played", label: "Played" },
  { key: "punctuality", label: "Punktualita (víc = častěji pozdě/dřív)" },
] as const;

export default async function PlayerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<PeriodFilterParams>;
}) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const { userId } = await params;
  const queryParams = await searchParams;
  const filter = parsePeriodFilter(queryParams);

  const data = await getPlayerStats(userId, filter).catch(() => null);
  if (!data) notFound();

  return (
    <main>
      <p>
        <Link href="/stats">← Statistiky</Link>
      </p>
      <h1>{data.displayName}</h1>
      <PeriodFilterBar basePath={`/players/${userId}`} filter={filter} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.6rem", margin: "1rem 0" }}>
        {METRIC_LABELS.map(({ key, label }) => (
          <div key={key} style={{ border: "1px solid #333", borderRadius: 6, padding: "0.5rem" }}>
            <div style={{ fontSize: "0.8rem", opacity: 0.7 }}>{label}</div>
            <div style={{ fontSize: "1.1rem" }}>{formatMetricPct(data.stats[key])}</div>
          </div>
        ))}
      </div>

      <h2>Historie raidů</h2>
      {data.history.length === 0 ? (
        <p style={{ opacity: 0.7 }}>V tomhle období žádný záznam.</p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "0.3rem 0.5rem" }}>Datum</th>
              <th style={{ textAlign: "left", padding: "0.3rem 0.5rem" }}>Raid</th>
              <th style={{ textAlign: "left", padding: "0.3rem 0.5rem" }}>Docházka</th>
              <th style={{ textAlign: "left", padding: "0.3rem 0.5rem" }}>Role</th>
            </tr>
          </thead>
          <tbody>
            {data.history.map((h) => (
              <tr key={h.raidId}>
                <td style={{ padding: "0.3rem 0.5rem" }}>{formatRaidDateTimeLabel(h.raidStartsAt)}</td>
                <td style={{ padding: "0.3rem 0.5rem" }}>
                  <Link href={`/raids/${h.raidId}`}>{h.raidInstance}</Link>
                </td>
                <td style={{ padding: "0.3rem 0.5rem" }}>{h.status}</td>
                <td style={{ padding: "0.3rem 0.5rem" }}>{h.role ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
