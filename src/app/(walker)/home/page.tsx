import Link from "next/link";
import { requireRole } from "@/lib/session";
import { Card, Empty, LinkButton, PageTitle } from "@/components/ui";
import { fmtTime, firstName } from "@/lib/format";
import { getTimeZone } from "@/lib/timezone";
import { addDays, dateKey, fmtDateKey } from "@/lib/time";
import { fetchBookingsForRange, occurrencesBetween } from "@/lib/schedule";

export default async function TodayPage() {
  const { supabase, profile } = await requireRole("walker", "operator");
  const tz = await getTimeZone();
  const today = dateKey(new Date(), tz);

  const [bookings, { data: activeWalk }, { count: clientCount }] = await Promise.all([
    fetchBookingsForRange(supabase, today, addDays(today, 1), tz),
    supabase.from("walks").select("id, started_at").eq("status", "in_progress").maybeSingle(),
    supabase.from("clients").select("id", { count: "exact", head: true }),
  ]);
  const todays = occurrencesBetween(bookings, today, addDays(today, 1), tz);

  return (
    <>
      <PageTitle sub={fmtDateKey(today, { weekday: "long", month: "long", day: "numeric" })}>
        Hey {firstName(profile?.full_name || "there")}
      </PageTitle>

      {activeWalk ? (
        <Link href={`/walk/${activeWalk.id}`} className="mb-4 block">
          <Card className="border-accent bg-accent/10">
            <p className="text-sm font-medium text-accent">Walk in progress</p>
            <p className="text-muted">Started {fmtTime(activeWalk.started_at, tz)} · tap to open</p>
          </Card>
        </Link>
      ) : (
        <LinkButton href="/walk/new" className="mb-4 w-full">
          Start a walk
        </LinkButton>
      )}

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Today</h2>
        <Link href="/schedule" className="text-sm text-accent">
          Week ›
        </Link>
      </div>
      {!todays.length ? (
        <Empty>
          {clientCount ? (
            <>Nothing scheduled today. <Link href="/schedule/new" className="text-accent underline">Add a booking</Link></>
          ) : (
            <>Start by <Link href="/clients/new" className="text-accent underline">adding your first client</Link>.</>
          )}
        </Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {todays.map(({ booking: b, at }) => {
            const client = Array.isArray(b.client) ? b.client[0] : b.client;
            const service = Array.isArray(b.service) ? b.service[0] : b.service;
            const dogs = (b.booking_dogs ?? []).map((bd) => (Array.isArray(bd.dog) ? bd.dog[0] : bd.dog)).filter(Boolean);
            return (
              <li key={`${b.id}-${at.toISOString()}`}>
                <Link href={`/schedule/${b.id}`}>
                  <Card className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {dogs.length ? dogs.map((d) => d!.name).join(", ") : client?.name}
                      </p>
                      <p className="text-sm text-muted">
                        {service?.name} · {b.duration_min} min
                        {b.repeat_weekdays?.length ? " · repeats" : ""}
                        {b.status === "needs_coverage" ? " · needs coverage" : ""}
                      </p>
                    </div>
                    <p className="text-sm font-medium">{fmtTime(at, tz)}</p>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
