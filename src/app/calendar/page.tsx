import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyCalendarToken } from "@/app/actions";
import { CalendarConnect } from "@/app/calendar-connect";
import { getCurrentAppUser } from "@/lib/auth";
import { toPragueDateKey } from "@/lib/local-date";
import { getCalendarMonth } from "./actions";
import { CalendarGrid } from "./calendar-grid";

const MONTH_LABEL_FORMAT = new Intl.DateTimeFormat("cs-CZ", { month: "long", timeZone: "UTC" });

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

function monthHref(year: number, month: number): string {
  return `/calendar?y=${year}&m=${month}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const params = await searchParams;
  const todayKey = toPragueDateKey(new Date());
  const [todayYear, todayMonth] = todayKey.split("-").map(Number);

  const year = Number(params.y) || todayYear;
  const month = Number(params.m) || todayMonth;

  const data = await getCalendarMonth(year, month);
  const calendarToken = await getMyCalendarToken();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  const prevMonth = shiftMonth(year, month, -1);
  const nextMonth = shiftMonth(year, month, 1);

  return (
    <main>
      <p>
        <Link href="/">← Dashboard</Link>
      </p>
      <h1>Kalendář</h1>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.6rem",
          margin: "1rem 0",
        }}
      >
        <Link href={monthHref(year - 1, month)} aria-label="O rok zpět">
          «
        </Link>
        <Link href={monthHref(prevMonth.year, prevMonth.month)} aria-label="Předchozí měsíc">
          ‹
        </Link>
        <strong style={{ minWidth: 140, textAlign: "center", textTransform: "capitalize" }}>
          {MONTH_LABEL_FORMAT.format(new Date(Date.UTC(year, month - 1, 1)))} {year}
        </strong>
        <Link href={monthHref(nextMonth.year, nextMonth.month)} aria-label="Následující měsíc">
          ›
        </Link>
        <Link href={monthHref(year + 1, month)} aria-label="O rok dopředu">
          »
        </Link>
      </div>
      <p style={{ textAlign: "center" }}>
        <Link href={monthHref(todayYear, todayMonth)}>Dnes</Link>
      </p>

      <CalendarGrid year={year} month={month} todayKey={todayKey} data={data} />

      <CalendarConnect initialToken={calendarToken} siteUrl={siteUrl} />
    </main>
  );
}
