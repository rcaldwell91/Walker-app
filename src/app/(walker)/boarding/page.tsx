import { after } from "next/server";
import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getTimeZone } from "@/lib/timezone";
import { Badge, Card, Empty, LinkButton, PageTitle, SectionTitle } from "@/components/ui";
import { BackBar } from "@/components/back-bar";
import { addDays, dateKey, fmtDateKey, isDateKey, mondayOf } from "@/lib/time";
import { cents } from "@/lib/format";
import { occupancy } from "@/lib/boarding";
import { sendStayReminders } from "@/lib/boarding-reminders";
import { CapacityForm } from "./capacity-form";

type Stay = {
  id: string;
  start_day: string;
  end_day: string;
  nights: number;
  price_cents: number;
  status: string;
  client: { id: string; name: string } | null;
  pets: string[];
};

/** Boarding: the month at a glance (booked nights, spots left, days away), then the stays. */
export default async function BoardingPage({ searchParams }: { searchParams: Promise<{ month?: string; day?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireRole("walker", "operator");
  const tz = await getTimeZone();
  after(() => sendStayReminders(user.id, tz)); // side work, after the page is on screen
  const today = dateKey(new Date(), tz);
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
  const first = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const gridStart = mondayOf(first);
  const gridEnd = addDays(mondayOf(last), 7); // exclusive
  const selected = isDateKey(sp.day) ? sp.day : null;
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);

  const [{ data: me }, { data: rows }, { data: away }, { data: upcoming }] = await Promise.all([
    supabase.from("walkers").select("boarding_capacity, boarding_night_cents").eq("id", user.id).single(),
    supabase
      .from("boarding_stays")
      .select("id, start_day, end_day, nights, price_cents, status, client:clients(id, name), stay_pets(dog:dogs(name))")
      .eq("walker_id", user.id)
      .neq("status", "cancelled")
      .lt("start_day", gridEnd)
      .gt("end_day", gridStart),
    supabase.from("walker_time_off").select("starts_on, ends_on").eq("walker_id", user.id).lte("starts_on", gridEnd).gte("ends_on", gridStart),
    supabase
      .from("boarding_stays")
      .select("id, start_day, end_day, nights, price_cents, status, client:clients(id, name), stay_pets(dog:dogs(name))")
      .eq("walker_id", user.id)
      .eq("status", "booked")
      .order("start_day")
      .limit(30),
  ]);
  const shape = (r: NonNullable<typeof rows>[number]): Stay => ({
    id: r.id,
    start_day: r.start_day,
    end_day: r.end_day,
    nights: r.nights,
    price_cents: r.price_cents,
    status: r.status,
    client: (Array.isArray(r.client) ? r.client[0] : r.client) ?? null,
    pets: (r.stay_pets ?? []).map((p) => (Array.isArray(p.dog) ? p.dog[0] : p.dog)?.name ?? "").filter(Boolean),
  });
  const stays = (rows ?? []).map(shape);
  const cap = me?.boarding_capacity ?? 0;
  const byNight = occupancy(stays.map((s) => ({ start_day: s.start_day, end_day: s.end_day, pets: s.pets.length })));
  const isAway = (d: string) => (away ?? []).some((a) => a.starts_on <= d && d <= a.ends_on);
  const days: string[] = [];
  for (let d = gridStart; d < gridEnd; d = addDays(d, 1)) days.push(d);
  const onNight = selected ? stays.filter((s) => s.start_day <= selected && selected < s.end_day) : [];
  const current = (upcoming ?? []).map(shape);

  return (
    <>
      <PageTitle sub="Overnight and multi-night stays at your place">Boarding</PageTitle>

      <LinkButton href={selected ? `/boarding/new?date=${selected}` : "/boarding/new"} className="mb-4 h-14 w-full text-lg" data-book-stay>
        Book a stay
      </LinkButton>

      <Card className="p-3" data-calendar={month}>
        <div className="mb-2 flex items-center justify-between">
          <Link href={`/boarding?month=${prev}`} className="flex h-11 w-11 items-center justify-center rounded-full text-xl" aria-label="Previous month">
            ‹
          </Link>
          <p className="font-medium">{fmtDateKey(first, { month: "long", year: "numeric" })}</p>
          <Link href={`/boarding?month=${next}`} className="flex h-11 w-11 items-center justify-center rounded-full text-xl" aria-label="Next month">
            ›
          </Link>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {days.map((d) => {
            const n = byNight.get(d) ?? 0;
            const off = isAway(d);
            const full = cap > 0 && n >= cap;
            const over = cap > 0 && n > cap;
            const inMonth = d.slice(0, 7) === month;
            const tone = off
              ? "bg-border text-muted line-through"
              : over
              ? "bg-warn/15 border-warn"
              : full
              ? "bg-accent/35 border-accent"
              : n
              ? "bg-accent/15 border-accent"
              : "bg-bg";
            return (
              <Link
                key={d}
                href={`/boarding?month=${month}&day=${d}`}
                className={`flex h-14 flex-col items-center justify-center rounded-lg border text-sm ${tone} ${
                  inMonth ? "" : "opacity-40"
                } ${d === selected ? "ring-2 ring-fg" : "border-transparent"} ${d === today ? "font-bold" : ""}`}
                data-day={d}
                data-booked={n}
                aria-label={`${fmtDateKey(d)}: ${off ? "away" : `${n} booked${cap ? `, ${Math.max(0, cap - n)} left` : ""}`}`}
              >
                <span>{Number(d.slice(8))}</span>
                <span className="text-[11px] leading-none">{off ? "away" : cap || n ? `${n}/${cap}` : ""}</span>
              </Link>
            );
          })}
        </div>
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
          <span>
            <span className="mr-1 inline-block h-3 w-3 rounded bg-accent/40 align-middle" />
            Booked (pets / spots)
          </span>
          <span>
            <span className="mr-1 inline-block h-3 w-3 rounded bg-accent/70 align-middle" />
            Full
          </span>
          <span>
            <span className="mr-1 inline-block h-3 w-3 rounded bg-warn/40 align-middle" />
            Over capacity
          </span>
          <span>
            <span className="mr-1 inline-block h-3 w-3 rounded bg-border align-middle" />
            Away
          </span>
        </p>
      </Card>

      {selected ? (
        <>
          <SectionTitle>Night of {fmtDateKey(selected)}</SectionTitle>
          {isAway(selected) ? (
            <p className="mb-2 text-sm text-muted">
              You&apos;re away this day.{" "}
              <Link href="/hours" className="text-accent underline">
                Time off
              </Link>
            </p>
          ) : null}
          {onNight.length ? (
            <StayList stays={onNight} />
          ) : (
            <p className="text-sm text-muted">
              Nobody booked.{cap ? ` ${cap} spot${cap === 1 ? "" : "s"} open.` : ""}
            </p>
          )}
        </>
      ) : null}

      <SectionTitle>Booked stays</SectionTitle>
      {current.length ? <StayList stays={current} today={today} /> : <Empty>No stays booked. Tap &ldquo;Book a stay&rdquo; to add one.</Empty>}

      <SectionTitle>How many pets you take</SectionTitle>
      <Card>
        <CapacityForm capacity={cap} />
        <p className="mt-2 text-xs text-muted">
          Nightly rate: {me?.boarding_night_cents != null ? `${cents(me.boarding_night_cents)} a night` : "not set"} ·{" "}
          <Link href="/money/rates" className="text-accent underline">
            My rates
          </Link>
          . Days away come from{" "}
          <Link href="/hours" className="text-accent underline">
            time off
          </Link>
          . Usual times and early pick-ups:{" "}
          <Link href="/settings" className="text-accent underline">
            Business settings
          </Link>
          .
        </p>
      </Card>

      <BackBar href="/hours" label="Schedule & hours" />
    </>
  );
}

function StayList({ stays, today }: { stays: Stay[]; today?: string }) {
  return (
    <ul className="flex flex-col gap-2">
      {stays.map((s) => {
        const here = today && s.start_day <= today && today <= s.end_day;
        return (
          <li key={s.id}>
            <Link href={`/boarding/${s.id}`} className="block" data-stay={s.id}>
              <Card className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{s.pets.join(" & ") || "No pets"}</span>
                  <span className="block text-sm text-muted">
                    {s.client?.name} · {fmtDateKey(s.start_day)} – {fmtDateKey(s.end_day)} · {s.nights} night{s.nights === 1 ? "" : "s"}
                  </span>
                </span>
                {here ? <Badge>Staying now</Badge> : s.status === "done" ? <Badge tone="muted">Picked up</Badge> : null}
              </Card>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
