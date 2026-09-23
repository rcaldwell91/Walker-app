import Link from "next/link";
import { requireRole } from "@/lib/session";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { fmtTime } from "@/lib/format";
import { getTimeZone } from "@/lib/timezone";
import { addDays, dateKey, fmtDateKey, isDateKey, mondayOf } from "@/lib/time";
import { fetchBookingsForRange, occurrencesBetween } from "@/lib/schedule";

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { supabase } = await requireRole("walker", "operator");
  const tz = await getTimeZone();
  const { week } = await searchParams;
  const today = dateKey(new Date(), tz);
  const monday = mondayOf(isDateKey(week) ? week : today);
  const nextMonday = addDays(monday, 7);

  const { bookings, exceptions } = await fetchBookingsForRange(supabase, monday, nextMonday, tz);
  const occurrences = occurrencesBetween(bookings, monday, nextMonday, tz, exceptions);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  return (
    <>
      <div className="mb-2 flex items-start justify-between gap-2">
        <PageTitle sub={`${fmtDateKey(monday, { month: "short", day: "numeric" })} – ${fmtDateKey(addDays(monday, 6), { month: "short", day: "numeric" })}`}>
          Schedule
        </PageTitle>
        <LinkButton href="/schedule/new" variant="secondary">
          + Add
        </LinkButton>
      </div>

      <nav className="mb-4 flex gap-2">
        <LinkButton href={`/schedule?week=${addDays(monday, -7)}`} variant="secondary" className="flex-1" aria-label="Previous week">
          ‹ Prev
        </LinkButton>
        <LinkButton href="/schedule" variant="secondary" className="flex-1">
          This week
        </LinkButton>
        <LinkButton href={`/schedule?week=${nextMonday}`} variant="secondary" className="flex-1" aria-label="Next week">
          Next ›
        </LinkButton>
      </nav>

      <ol className="flex flex-col gap-4">
        {days.map((day) => {
          const items = occurrences.filter((o) => o.day === day);
          return (
            <li key={day} data-day={day}>
              <div className="mb-1 flex items-center justify-between">
                <h2 className={`text-sm font-medium uppercase tracking-wide ${day === today ? "text-accent" : "text-muted"}`}>
                  {fmtDateKey(day)}
                  {day === today ? " · Today" : ""}
                </h2>
                <Link href={`/schedule/new?date=${day}`} className="text-sm text-accent" aria-label={`Add a booking on ${fmtDateKey(day)}`}>
                  + Add
                </Link>
              </div>
              {items.length ? (
                <ul className="flex flex-col gap-2">
                  {items.map(({ booking: b, at, originalDay, durationMin, skipped, moved }) => {
                    const client = Array.isArray(b.client) ? b.client[0] : b.client;
                    const service = Array.isArray(b.service) ? b.service[0] : b.service;
                    const dogs = (b.booking_dogs ?? [])
                      .map((bd) => (Array.isArray(bd.dog) ? bd.dog[0] : bd.dog)?.name)
                      .filter(Boolean);
                    return (
                      <li key={`${b.id}-${originalDay}`} data-occurrence={skipped ? "skipped" : moved ? "moved" : "on"}>
                        <Link href={`/schedule/${b.id}?on=${originalDay}`}>
                          <Card className={`flex items-center gap-3 ${skipped ? "opacity-50" : ""}`}>
                            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: client?.color ?? "var(--border)" }} />
                            <div className="min-w-0 flex-1">
                              <p className={`truncate font-medium ${skipped ? "line-through" : ""}`}>{dogs.join(", ") || client?.name}</p>
                              <p className="truncate text-sm text-muted">
                                {skipped ? "Skipped this day · " : moved ? "Moved · " : ""}
                                {client?.name} · {service?.name} · {durationMin} min
                                {b.repeat_weekdays?.length && !skipped && !moved ? " · ↻" : ""}
                                {b.status === "needs_coverage" ? " · needs coverage" : ""}
                              </p>
                            </div>
                            <p className="shrink-0 text-sm font-medium">{fmtTime(at, tz)}</p>
                          </Card>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted">Nothing booked.</p>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
