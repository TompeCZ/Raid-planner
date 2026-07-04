import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth";
import { CalendarConnect } from "./calendar-connect";
import { getDashboardRaids, getMyCalendarToken } from "./actions";

const WEEKDAY_FORMAT = new Intl.DateTimeFormat("cs-CZ", {
  weekday: "long",
  day: "numeric",
  month: "numeric",
  timeZone: "Europe/Prague",
});
const TIME_FORMAT = new Intl.DateTimeFormat("cs-CZ", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Prague",
});

/** `dateKey` (YYYY-MM-DD) -> lidský popisek dne v Europe/Prague. */
function formatDayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  // Poledne UTC je bezpečně uvnitř stejného pražského dne bez ohledu na DST.
  const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return WEEKDAY_FORMAT.format(anchor);
}

function formatTimeRange(startsAt: Date, endsAt: Date): string {
  return `${TIME_FORMAT.format(startsAt)}–${TIME_FORMAT.format(endsAt)}`;
}

export default async function DashboardPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const days = await getDashboardRaids();
  const todayKey = days[0]?.dateKey;
  const calendarToken = await getMyCalendarToken();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  return (
    <main>
      <h1>Raid Planner</h1>
      <p style={{ opacity: 0.7 }}>Přihlášen jako {appUser.displayName}</p>

      <nav style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", margin: "1rem 0 1.5rem" }}>
        <Link href="/characters">Postavy</Link>
        <Link href="/raids">Raidy</Link>
        <Link href="/absences">Absence</Link>
        <Link href="/calendar">Kalendář</Link>
      </nav>

      <h2>Příštích 7 dní</h2>
      <div style={{ display: "grid", gap: "0.75rem" }}>
        {days.map((day) => (
          <div key={day.dateKey} style={{ borderBottom: "1px solid #333", paddingBottom: "0.5rem" }}>
            <div style={{ fontWeight: "bold", textTransform: "capitalize" }}>
              {formatDayLabel(day.dateKey)}
              {day.dateKey === todayKey && (
                <span style={{ fontWeight: "normal", opacity: 0.6 }}> · dnes</span>
              )}
            </div>
            {day.raids.length === 0 ? (
              <div style={{ opacity: 0.5, fontSize: "0.9rem" }}>Žádné raidy.</div>
            ) : (
              <ul style={{ margin: "0.25rem 0 0", padding: 0 }}>
                {day.raids.map((r) => (
                  <li key={r.id} style={{ listStyle: "none", fontSize: "0.9rem" }}>
                    <Link href={`/raids/${r.id}`}>
                      <strong>{r.instance}</strong>
                    </Link>{" "}
                    {formatTimeRange(r.startsAt, r.endsAt)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <CalendarConnect initialToken={calendarToken} siteUrl={siteUrl} />
    </main>
  );
}
