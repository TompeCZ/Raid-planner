import Link from "next/link";
import { redirect } from "next/navigation";
import { canAccessNotes, getCurrentAppUser } from "@/lib/auth";
import { getRosterOverview } from "@/lib/notes-query";
import { parsePeriodFilter, type PeriodFilterParams } from "@/lib/period-filter";
import { RosterFilterBar } from "./roster-filter-bar";
import { RosterTable } from "./roster-table";

type RosterSearchParams = PeriodFilterParams & { rank?: string; sentiment?: string; category?: string };

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<RosterSearchParams>;
}) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  // Route je celá za vedením — MEMBER dostane server-side redirect na dashboard,
  // ne jen schované UI (gate se dělá v datové vrstvě/serveru, viz notes-query.ts).
  if (!canAccessNotes(appUser)) redirect("/");

  const params = await searchParams;
  const filter = parsePeriodFilter(params);
  const rows = await getRosterOverview(appUser.id, filter);

  const filtered = rows.filter((r) => {
    if (params.rank && r.guildRank !== params.rank) return false;
    if (params.sentiment === "CONCERN" && !r.hasOpenConcern) return false;
    if (params.category && !r.noteCategories.includes(params.category as (typeof r.noteCategories)[number])) {
      return false;
    }
    return true;
  });

  return (
    <main>
      <p>
        <Link href="/">← Dashboard</Link>
      </p>
      <h1>Roster</h1>
      <RosterFilterBar
        periodFilter={filter}
        extraFilters={{ rank: params.rank, sentiment: params.sentiment, category: params.category }}
      />
      <RosterTable rows={filtered} />
    </main>
  );
}
