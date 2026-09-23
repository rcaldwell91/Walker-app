import Link from "next/link";
import { requireRole } from "@/lib/session";
import { Card, Empty, LinkButton, PageTitle } from "@/components/ui";
import { fmtTime, firstName } from "@/lib/format";
import { getTimeZone } from "@/lib/timezone";
import { addDays, dateKey, fmtDateKey } from "@/lib/time";
import { fetchBookingsForRange, occurrencesBetween } from "@/lib/schedule";
import { dayCoverage, fetchMyCoverage } from "@/lib/coverage";
import { CoverBadge, CoveringCard, IncomingCoverCard } from "../cover-cards";
import { NotificationsInbox } from "@/components/notifications-inbox";

export default async function TodayPage() {
  const { supabase, user, profile } = await requireRole("walker", "operator");
  const tz = await getTimeZone();
  const today = dateKey(new Date(), tz);

  const [{ bookings, exceptions }, { data: activeWalk }, { count: clientCount }, coverage, { data: othersWalks }] = await Promise.all([
    fetchBookingsForRange(supabase, today, addDays(today, 1), tz),
    supabase.from("walks").select("id, started_at").eq("walker_id", user.id).eq("status", "in_progress").maybeSingle(),
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("walker_id", user.id),
    fetchMyCoverage(supabase),
    // Walks by someone else with your dogs on them: covered walks.
    supabase.from("walks").select("id, walker_id, started_at").neq("walker_id", user.id),
  ]);
  const todays = occurrencesBetween(bookings, today, addDays(today, 1), tz, exceptions).filter((o) => !o.skipped);
  const now = Date.now();
  const incoming = coverage.filter((r) => r.incoming && r.status === "open" && new Date(r.access_until).getTime() > now);
  const covering = coverage.filter((r) => r.incoming && r.status === "accepted" && dateKey(new Date(r.starts_at), tz) === today);
  const reportFor = (walkerId: string, day: string) =>
    (othersWalks ?? []).find((w) => w.walker_id === walkerId && w.started_at && dateKey(new Date(w.started_at), tz) === day)?.id ?? null;

  return (
    <>
      <PageTitle sub={fmtDateKey(today, { weekday: "long", month: "long", day: "numeric" })}>
        Hey {firstName(profile?.full_name || "there")}
      </PageTitle>

      <NotificationsInbox supabase={supabase} tz={tz} />

      {incoming.map((r) => (
        <IncomingCoverCard key={r.id} r={r} tz={tz} />
      ))}

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
      {!todays.length && !covering.length ? (
        <Empty>
          {clientCount ? (
            <>Nothing scheduled today. <Link href="/schedule/new" className="text-accent underline">Add a booking</Link></>
          ) : (
            <>Start by <Link href="/clients/new" className="text-accent underline">adding your first client</Link>.</>
          )}
        </Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {covering.map((r) => (
            <li key={r.id}>
              <CoveringCard r={r} tz={tz} />
            </li>
          ))}
          {todays.map(({ booking: b, at, originalDay, durationMin, moved }) => {
            const client = Array.isArray(b.client) ? b.client[0] : b.client;
            const service = Array.isArray(b.service) ? b.service[0] : b.service;
            const dogs = (b.booking_dogs ?? []).map((bd) => (Array.isArray(bd.dog) ? bd.dog[0] : bd.dog)).filter(Boolean);
            const cover = dayCoverage(coverage, b.id, originalDay);
            const report = cover?.kind === "covered" ? reportFor(cover.request.to_walker_id, originalDay) : null;
            return (
              <li key={`${b.id}-${at.toISOString()}`} data-occurrence-day={originalDay}>
                <Link href={`/schedule/${b.id}?on=${originalDay}`}>
                  <Card className={`flex items-center justify-between ${cover?.kind === "covered" ? "opacity-70" : ""}`}>
                    <div>
                      <p className="font-medium">
                        {dogs.length ? dogs.map((d) => d!.name).join(", ") : client?.name}
                      </p>
                      <p className="text-sm text-muted">
                        {service?.name} · {durationMin} min
                        {moved ? " · moved" : b.repeat_weekdays?.length ? " · repeats" : ""}
                      </p>
                      <CoverBadge c={cover} />
                    </div>
                    <p className="text-sm font-medium">{fmtTime(at, tz)}</p>
                  </Card>
                </Link>
                {report ? (
                  <Link href={`/report/${report}`} className="mt-1 block text-right text-sm text-accent" data-report-link>
                    See the walk report ›
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
