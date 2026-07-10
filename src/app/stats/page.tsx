import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth";
import { parsePeriodFilter, type PeriodFilterParams } from "@/lib/period-filter";
import { PeriodFilterBar } from "@/app/period-filter-bar";
import { getGuildLeaderboard } from "./actions";
import { LeaderboardTable } from "./leaderboard-table";

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<PeriodFilterParams>;
}) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const params = await searchParams;
  const filter = parsePeriodFilter(params);
  const rows = await getGuildLeaderboard(filter);

  return (
    <main>
      <p>
        <Link href="/">← Dashboard</Link>
      </p>
      <h1>Statistiky — guild žebříček</h1>
      <PeriodFilterBar basePath="/stats" filter={filter} />
      <LeaderboardTable rows={rows} />
    </main>
  );
}
