import Link from "next/link";
import { redirect } from "next/navigation";
import { AbsenceChip, RaidMarkerPill } from "@/app/calendar/day-markers";
import { getCurrentAppUser } from "@/lib/auth";
import { getDashboardRaids } from "./actions";

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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.6rem" }}>
        {days.map((day) => {
          const isToday = day.dateKey === todayKey;
          return (
            <div
              key={day.dateKey}
              style={{
                border: isToday ? "1px solid #4ea1ff" : "1px solid #333",
                borderRadius: 6,
                padding: "0.5rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.35rem",
              }}
            >
              <div style={{ fontWeight: "bold", fontSize: "0.85rem", textTransform: "capitalize" }}>
                {formatDayLabel(day.dateKey)}
                {isToday && <span style={{ fontWeight: "normal", opacity: 0.6 }}> · dnes</span>}
              </div>
              {day.raids.length === 0 && day.absences.length === 0 ? (
                <div style={{ opacity: 0.5, fontSize: "0.85rem" }}>Žádné raidy ani absence.</div>
              ) : (
                <>
                  {day.raids.map((r) => (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
                      <Link href={`/raids/${r.id}`}>
                        <RaidMarkerPill instance={r.instance} full />
                      </Link>
                      <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>
                        {formatTimeRange(r.startsAt, r.endsAt)}
                      </span>
                    </div>
                  ))}
                  {day.absences.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                      {day.absences.map((a) => (
                        <AbsenceChip key={a.id} displayName={a.displayName} characterClass={a.characterClass} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
