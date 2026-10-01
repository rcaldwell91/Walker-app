import Link from "next/link";
import { after } from "next/server";
import { requireRole } from "@/lib/session";
import { Card, Empty, LinkButton, PageTitle } from "@/components/ui";
import { fmtTime, firstName } from "@/lib/format";
import { getTimeZone } from "@/lib/timezone";
import { addDays, dateKey, fmtDateKey } from "@/lib/time";
import { fetchBookingsForRange, occurrencesBetween } from "@/lib/schedule";
import { dayCoverage, fetchMyCoverage } from "@/lib/coverage";
import { CoverBadge, CoveringCard, IncomingCoverCard } from "../cover-cards";
import { NotificationsInbox, fetchUnreadNotifications } from "@/components/notifications-inbox";
import { sendStayReminders } from "@/lib/boarding-reminders";

export default async function TodayPage() {
  const { supabase, user, profile } = await requireRole("walker", "operator");
  const tz = await getTimeZone();
  const today = dateKey(new Date(), tz);
  // "Boarding starts tomorrow" reminders are side work: sent after the page is on screen.
  after(() => sendStayReminders(user.id, tz));

  const [{ bookings, exceptions }, { data: activeWalk }, { count: clientCount }, coverage, { data: othersWalks }, { data: boarders }, { data: unread }] = await Promise.all([
    fetchBookingsForRange(supabase, today, addDays(today, 1), tz),
    supabase.from("walks").select("id, started_at").eq("walker_id", user.id).eq("status", "in_progress").maybeSingle(),
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("walker_id", user.id),
    fetchMyCoverage(supabase),
    // Walks by someone else with your dogs on them: covered walks.
    supabase.from("walks").select("id, walker_id, started_at").neq("walker_id", user.id),
    supabase
      .from("boarding_stays")
      .select("id, stay_pets(dog:dogs(name)), stay_updates(day, posted_at)")
      .eq("walker_id", user.id)
      .eq("status", "booked")
      .lte("start_day", today)
      .gte("end_day", today),
    fetchUnreadNotifications(supabase),
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

      {/* Below the main button, so clearing it never moves "Start a walk". */}
      <NotificationsInbox supabase={supabase} tz={tz} here="/home" rows={unread} />

      {boarders?.length ? (
        <Card className="mb-4 flex flex-col gap-2" data-boarding-today>
          <Link href="/boarding" className="text-sm font-medium text-accent">
            Boarding now ›
          </Link>
          {boarders.map((b) => {
            const names = (b.stay_pets ?? []).map((sp) => (Array.isArray(sp.dog) ? sp.dog[0] : sp.dog)?.name).filter(Boolean).join(" & ");
            const done = (b.stay_updates ?? []).some((u) => u.day === today && u.posted_at);
            return (
              <Link key={b.id} href={done ? `/boarding/${b.id}` : `/boarding/${b.id}/update?day=${today}`} className="flex min-h-11 items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium">{names}</span>
                <span className={`shrink-0 text-sm ${done ? "text-muted" : "text-accent"}`}>{done ? "Update posted ✓" : "Post today's update ›"}</span>
              </Link>
            );
          })}
        </Card>
      ) : null}

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
