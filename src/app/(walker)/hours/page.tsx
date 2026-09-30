import { requireRole } from "@/lib/session";
import { Card, NavList, PageTitle, SectionTitle } from "@/components/ui";
import { BackBar } from "@/components/back-bar";
import { getTimeZone } from "@/lib/timezone";
import { addDays, dateKey, fmtDateKey, mondayOf, zonedToUtc } from "@/lib/time";
import { fetchBookingsForRange, occurrencesBetween } from "@/lib/schedule";
import { fmtHours, totalMinutes } from "@/lib/hours";
import { removeTimeOff } from "./actions";
import { TimeOffForm } from "./time-off-form";

export default async function HoursPage() {
  const { supabase, user } = await requireRole("walker", "operator");
  const tz = await getTimeZone();
  const today = dateKey(new Date(), tz);
  const monday = mondayOf(today);
  const weekStart = zonedToUtc(monday, 0, 0, tz);
  const monthStart = zonedToUtc(`${today.slice(0, 7)}-01`, 0, 0, tz);
  const since = new Date(Math.min(weekStart.getTime(), monthStart.getTime())).toISOString();

  const [{ data: walks }, { data: timeOff }, { bookings, exceptions }] = await Promise.all([
    supabase.from("walks").select("started_at, walk_minutes, drive_minutes").eq("walker_id", user.id).eq("status", "done").gte("started_at", since),
    supabase.from("walker_time_off").select("id, starts_on, ends_on, note").eq("walker_id", user.id).gte("ends_on", today).order("starts_on"),
    fetchBookingsForRange(supabase, monday, addDays(monday, 7), tz),
  ]);
  const inRange = (from: Date) => (walks ?? []).filter((w) => new Date(w.started_at) >= from);
  const week = totalMinutes(inRange(weekStart));
  const month = totalMinutes(inRange(monthStart));
  const left = occurrencesBetween(bookings, monday, addDays(monday, 7), tz, exceptions).filter((o) => !o.skipped && o.day >= today).length;

  return (
    <>
      <PageTitle>Schedule & hours</PageTitle>

      <NavList
        items={[
          { href: "/schedule", label: "Bookings", sub: left ? `${left} more this week` : "Nothing else booked this week" },
          { href: "/schedule/new", label: "Add a booking", sub: "One-off or repeating" },
          { href: "/boarding", label: "Boarding", sub: "Overnight stays: calendar, capacity, daily updates" },
        ]}
      />

      <SectionTitle>Hours</SectionTitle>
      <Card>
        <table className="w-full text-sm" data-hours>
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1 font-normal"></th>
              <th className="font-normal">Walks</th>
              <th className="font-normal">Walking</th>
              <th className="font-normal">Driving</th>
              <th className="font-normal">Total</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["This week", week],
                ["This month", month],
              ] as const
            ).map(([label, t]) => (
              <tr key={label} data-period={label} className="border-t border-border">
                <td className="py-2 font-medium">{label}</td>
                <td>{t.walks}</td>
                <td>{fmtHours(t.walkMinutes)}</td>
                <td>{fmtHours(t.driveMinutes)}</td>
                <td className="font-medium">{fmtHours(t.walkMinutes + t.driveMinutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">Driving is from starting a walk to your last pickup.</p>
      </Card>

      <SectionTitle>Time off</SectionTitle>
      {timeOff?.length ? (
        <ul className="mb-3 flex flex-col gap-2" data-time-off-list>
          {timeOff.map((t) => (
            <li key={t.id}>
              <Card className="flex items-center justify-between gap-2">
                <span>
                  <span className="font-medium">
                    {fmtDateKey(t.starts_on)}
                    {t.ends_on !== t.starts_on ? ` – ${fmtDateKey(t.ends_on)}` : ""}
                  </span>
                  {t.note ? <span className="block text-sm text-muted">{t.note}</span> : null}
                </span>
                <form action={removeTimeOff.bind(null, t.id)}>
                  <button className="min-h-11 px-2 text-sm text-muted underline">Remove</button>
                </form>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-muted">No time off coming up. Days you add show on your schedule.</p>
      )}
      <Card>
        <TimeOffForm today={today} />
      </Card>

      <BackBar href="/more" label="More" />
    </>
  );
}
