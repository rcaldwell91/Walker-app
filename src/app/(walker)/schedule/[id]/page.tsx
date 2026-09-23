import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { Button, Card, PageTitle } from "@/components/ui";
import { getTimeZone } from "@/lib/timezone";
import { dateKey, fmtDateKey, isDateKey, timeOfDay } from "@/lib/time";
import { fmtDate, fmtTime } from "@/lib/format";
import { isSeriesDay } from "@/lib/schedule";
import { BookingForm } from "../booking-form";
import { bookingOptions } from "../options";
import { clearOccurrenceChange, setBookingCancelled, skipOccurrence } from "../actions";
import { MoveOccurrenceForm } from "./move-form";
import { CoverRequestForm } from "./cover-form";
import { cancelCoverage } from "../../coverage-actions";
import { dayCoverage, fetchMyCoverage } from "@/lib/coverage";

export default async function EditBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ on?: string }>;
}) {
  const { id } = await params;
  const { on } = await searchParams;
  const { supabase, user } = await requireRole("walker", "operator");
  const tz = await getTimeZone();
  const [{ data: b }, { clients, services }] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, client_id, service_type_id, starts_at, duration_min, status, repeat_weekdays, repeat_until, booking_dogs(dog_id), client:clients(name)")
      .eq("id", id)
      .maybeSingle(),
    bookingOptions(supabase, user.id),
  ]);
  if (!b) notFound();

  const start = new Date(b.starts_at);
  const cancelled = b.status === "cancelled";
  // Opened from one day: offer to change just that day (repeats) and to get it covered.
  const occDay = !cancelled && isDateKey(on) && isSeriesDay(b, on, tz) ? on : null;
  const day = occDay && b.repeat_weekdays?.length ? occDay : null;
  const { data: change } = occDay
    ? await supabase.from("booking_exceptions").select("skipped, moved_to").eq("booking_id", b.id).eq("occurs_on", occDay).maybeSingle()
    : { data: null };

  // Coverage for that day: who's covering or asked, and squad members this client approved.
  const clientName = (Array.isArray(b.client) ? b.client[0] : b.client)?.name ?? "the client";
  const [coverage, { data: squadRows }, { data: approvals }] = occDay
    ? await Promise.all([
        fetchMyCoverage(supabase),
        supabase.rpc("squad_overview"),
        supabase.from("coverage_approvals").select("coverage_walker_id").eq("client_id", b.client_id).is("revoked_at", null),
      ])
    : [[], { data: [] }, { data: [] }];
  const cover = occDay ? dayCoverage(coverage, b.id, occDay) : null;
  const approved = new Set((approvals ?? []).map((a) => a.coverage_walker_id));
  const squad = ((squadRows ?? []) as { status: string; walker_id: string; full_name: string; handle: string }[])
    .filter((m) => m.status === "accepted")
    .map((m) => ({ walker_id: m.walker_id, full_name: m.full_name, handle: m.handle, approved: approved.has(m.walker_id) }));

  return (
    <>
      <PageTitle sub={b.repeat_weekdays?.length ? "Changes apply to every repeat." : undefined}>Edit booking</PageTitle>

      {cancelled ? (
        <Card className="mb-4 border-warn/40">
          <p className="mb-3 font-medium text-warn">This booking is cancelled.</p>
          <form action={setBookingCancelled.bind(null, b.id, false)}>
            <Button type="submit" variant="secondary" className="w-full">
              Restore it
            </Button>
          </form>
        </Card>
      ) : null}

      {day ? (
        <Card className="mb-6">
          <p className="font-medium">Just {fmtDateKey(day)}</p>
          {change?.skipped ? (
            <>
              <p className="mb-3 text-sm text-muted">Skipped. The rest of the repeats are unchanged.</p>
              <form action={clearOccurrenceChange.bind(null, b.id, day)}>
                <Button type="submit" variant="secondary" className="w-full">
                  Put this day back
                </Button>
              </form>
            </>
          ) : change?.moved_to ? (
            <>
              <p className="mb-3 text-sm text-muted">
                Moved to {fmtDate(change.moved_to, tz)} at {fmtTime(change.moved_to, tz)}. The rest of the repeats are unchanged.
              </p>
              <form action={clearOccurrenceChange.bind(null, b.id, day)}>
                <Button type="submit" variant="secondary" className="w-full">
                  Put it back at the usual time
                </Button>
              </form>
            </>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">Change this one day without touching the rest.</p>
              <form action={skipOccurrence.bind(null, b.id, day, tz)} className="mb-4">
                <Button type="submit" variant="secondary" className="w-full">
                  Skip this day
                </Button>
              </form>
              <MoveOccurrenceForm bookingId={b.id} day={day} defaultTime={timeOfDay(start, tz).hhmm} defaultDuration={b.duration_min} />
            </>
          )}
        </Card>
      ) : null}

      {occDay && !change?.skipped ? (
        <Card className="mb-6" data-coverage={cover?.kind ?? "none"}>
          <p className="font-medium">Coverage for {fmtDateKey(occDay)}</p>
          {cover?.kind === "covered" ? (
            <>
              <p className="mb-3 text-sm">
                Covered by <span className="font-medium">{cover.request.to_name}</span>. {clientName} has been told.
              </p>
              <form action={cancelCoverage.bind(null, cover.request.id)}>
                <Button type="submit" variant="secondary" className="w-full">
                  Cancel the cover
                </Button>
              </form>
            </>
          ) : (
            <>
              {cover?.kind === "requested" ? (
                <ul className="mb-3 text-sm">
                  {cover.requests.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2">
                      <span>Asked {r.to_name}. Waiting to hear back.</span>
                      <form action={cancelCoverage.bind(null, r.id)}>
                        <button type="submit" className="text-xs text-muted underline">
                          Withdraw
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : cover?.kind === "needs" ? (
                <p className="mb-3 inline-block rounded-full bg-warn/10 px-3 py-1 text-sm font-medium text-warn">Needs coverage</p>
              ) : (
                <p className="mb-3 text-sm text-muted">Can&apos;t make it? Ask someone in your squad.</p>
              )}
              <CoverRequestForm bookingId={b.id} day={occDay} clientId={b.client_id} clientName={clientName} squad={squad} />
            </>
          )}
        </Card>
      ) : null}

      {day ? <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Every repeat</h2> : null}
      <BookingForm
        bookingId={b.id}
        clients={clients}
        services={services}
        initial={{
          client_id: b.client_id,
          service_type_id: b.service_type_id,
          date: dateKey(start, tz),
          time: timeOfDay(start, tz).hhmm,
          duration_min: b.duration_min,
          repeat_weekdays: b.repeat_weekdays ?? [],
          repeat_until: b.repeat_until,
          dog_ids: (b.booking_dogs ?? []).map((bd) => bd.dog_id),
        }}
      />

      {!cancelled ? (
        <form action={setBookingCancelled.bind(null, b.id, true)} className="mt-6">
          <Button type="submit" variant="danger" className="w-full">
            {b.repeat_weekdays?.length ? "Cancel all repeats" : "Cancel booking"}
          </Button>
        </form>
      ) : null}
    </>
  );
}
