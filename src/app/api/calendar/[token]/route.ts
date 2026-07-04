import { NextResponse } from "next/server";
import { and, eq, gte, isNull, notInArray } from "drizzle-orm";
import { db } from "@/db/client";
import { raid, user } from "@/db/schema";
import { buildVCalendar } from "@/lib/ical";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Veřejný (bez loginu) iCal odběr raidů daného hráče podle jeho
 * `calendar_token`. Žádné absence — jen raidy, rolující okno dnes−30 dní..
 * budoucnost, bez DRAFT/CANCELLED.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!UUID_RE.test(token)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const [userRow] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.calendarToken, token), isNull(user.deletedAt)))
    .limit(1);

  if (!userRow) {
    return new NextResponse("Not found", { status: 404 });
  }

  const windowStart = new Date();
  windowStart.setUTCDate(windowStart.getUTCDate() - 30);

  const raidRows = await db
    .select({ id: raid.id, instance: raid.instance, startsAt: raid.startsAt, endsAt: raid.endsAt })
    .from(raid)
    .where(and(gte(raid.startsAt, windowStart), notInArray(raid.status, ["DRAFT", "CANCELLED"])))
    .orderBy(raid.startsAt);

  const body = buildVCalendar(raidRows);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="raid-planner.ics"',
      "Cache-Control": "no-store",
    },
  });
}
