import Link from "next/link";
import { requireRole } from "@/lib/session";
import { logout } from "@/app/(auth)/actions";
import { Card, PageTitle } from "@/components/ui";
import { getTimeZone } from "@/lib/timezone";
import { dateKey, mondayOf, zonedToUtc } from "@/lib/time";
import { cents } from "@/lib/format";
import { fmtHours, totalMinutes } from "@/lib/hours";

const items = [
  { href: "/profile", label: "My profile page", sub: "Bio, services, rates, background check" },
  { href: "/schedule", label: "Schedule", sub: "Bookings and repeats" },
  { href: "/squad", label: "Coverage squad", sub: "Walkers who can cover for you" },
  { href: "/incidents", label: "Incident reports" },
  { href: "/check-ins", label: "Client check-ins and suggestions", sub: "Check-ins, suggestion box, ratings" },
  { href: "/community", label: "Community", sub: "Alerts, forums, meetups" },
  { href: "/resources", label: "Resources", sub: "Tips and videos" },
  { href: "/billing", label: "Plan and fees" },
];

export default async function MorePage() {
  const { supabase, user, profile } = await requireRole("walker", "operator");
  const tz = await getTimeZone();
  const today = dateKey(new Date(), tz);
  const weekStart = zonedToUtc(mondayOf(today), 0, 0, tz);
  const monthStart = zonedToUtc(`${today.slice(0, 7)}-01`, 0, 0, tz);
  const since = new Date(Math.min(weekStart.getTime(), monthStart.getTime())).toISOString();

  const [{ data: walks }, { data: tips }, { count: newSuggestions }] = await Promise.all([
    supabase.from("walks").select("started_at, walk_minutes, drive_minutes").eq("walker_id", user.id).eq("status", "done").gte("started_at", since),
    supabase.from("tips").select("amount_cents, created_at").neq("status", "cancelled"),
    supabase.from("suggestions").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);
  const inRange = (from: Date) => (walks ?? []).filter((w) => new Date(w.started_at) >= from);
  const week = totalMinutes(inRange(weekStart));
  const month = totalMinutes(inRange(monthStart));
  const tipsMonth = (tips ?? []).filter((t) => new Date(t.created_at) >= monthStart).reduce((n, t) => n + t.amount_cents, 0);
  const tipsAll = (tips ?? []).reduce((n, t) => n + t.amount_cents, 0);

  return (
    <>
      <PageTitle sub={profile?.full_name}>More</PageTitle>

      <Card className="mb-4">
        <p className="mb-2 font-medium">Hours</p>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="font-normal"></th>
              <th className="font-normal">Walks</th>
              <th className="font-normal">Walking</th>
              <th className="font-normal">Driving</th>
              <th className="font-normal">Total</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["This week", week],
              ["This month", month],
            ].map(([label, t]) => {
              const x = t as ReturnType<typeof totalMinutes>;
              return (
                <tr key={label as string} data-period={label as string}>
                  <td className="py-1 font-medium">{label as string}</td>
                  <td>{x.walks}</td>
                  <td>{fmtHours(x.walkMinutes)}</td>
                  <td>{fmtHours(x.driveMinutes)}</td>
                  <td>{fmtHours(x.walkMinutes + x.driveMinutes)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">Driving is from starting a walk to your last pickup.</p>
      </Card>

      <Card className="mb-4">
        <p className="font-medium">Tips</p>
        <p className="text-sm" data-tips-month={tipsMonth}>
          {cents(tipsMonth)} this month · {cents(tipsAll)} all time
        </p>
        <p className="text-xs text-muted">Recorded now. Payouts start when card payments are set up.</p>
      </Card>

      <ul className="flex flex-col gap-2">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href}>
              <Card className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{i.label}</p>
                  {i.sub ? <p className="text-sm text-muted">{i.sub}</p> : null}
                </div>
                <span className="flex items-center gap-2">
                  {i.href === "/check-ins" && newSuggestions ? (
                    <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-fg">{newSuggestions} new</span>
                  ) : null}
                  <span className="text-muted">›</span>
                </span>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
      <form action={logout} className="mt-6">
        <button className="text-sm text-muted underline">Log out</button>
      </form>
    </>
  );
}
