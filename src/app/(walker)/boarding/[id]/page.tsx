import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { getTimeZone } from "@/lib/timezone";
import { Badge, Card, LinkButton, PageTitle, SectionTitle } from "@/components/ui";
import { BackBar } from "@/components/back-bar";
import { BoardingAnswers } from "@/components/boarding-intake";
import { cents, fmtDate, fmtTime } from "@/lib/format";
import { addDays, dateKey, fmtDateKey } from "@/lib/time";
import type { PetBoarding } from "@/lib/boarding";
import { StayIntakeForm } from "./intake-form";
import { CancelStayButton } from "./cancel-button";

export default async function StayPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ posted?: string }> }) {
  const { id } = await params;
  const { posted } = await searchParams;
  const { supabase, user } = await requireRole("walker", "operator");
  const tz = await getTimeZone();
  const { data: stay } = await supabase
    .from("boarding_stays")
    .select(
      "id, starts_at, ends_at, start_day, end_day, nights, price_cents, notes, status, client:clients(id, name, emergency_contact, boarding_bringing), stay_pets(dog:dogs(id, name, boarding)), stay_updates(id, day, posted_at, note)",
    )
    .eq("id", id)
    .eq("walker_id", user.id)
    .maybeSingle();
  if (!stay) notFound();
  const client = Array.isArray(stay.client) ? stay.client[0] : stay.client;
  const pets = (stay.stay_pets ?? [])
    .map((sp) => (Array.isArray(sp.dog) ? sp.dog[0] : sp.dog))
    .filter((d): d is NonNullable<typeof d> => !!d)
    .map((d) => ({ id: d.id, name: d.name, boarding: (d.boarding ?? {}) as PetBoarding }));
  const today = dateKey(new Date(), tz);
  const updates = new Map((stay.stay_updates ?? []).map((u) => [u.day, u]));
  const lastDay = stay.end_day < today ? stay.end_day : today;
  const days: string[] = [];
  for (let d = lastDay; d >= stay.start_day; d = addDays(d, -1)) days.push(d);
  const here = stay.status === "booked" && stay.start_day <= today && today <= stay.end_day;
  const todays = updates.get(today);
  const names = pets.map((p) => p.name).join(" & ");

  return (
    <>
      <PageTitle
        sub={
          <>
            <Link href={`/clients/${client?.id}`} className="text-accent">
              {client?.name}
            </Link>{" "}
            · {stay.nights} night{stay.nights === 1 ? "" : "s"} · {cents(stay.price_cents)}
          </>
        }
      >
        {names || "Stay"}
      </PageTitle>

      {posted ? (
        <p className="mb-3 rounded-xl bg-accent/10 px-3 py-2 text-sm text-accent" role="status" data-posted>
          Update for {fmtDateKey(posted)} posted. {client?.name} can see it now.
        </p>
      ) : null}

      <Card className="mb-3 flex flex-col gap-1 text-sm" data-stay-status={stay.status}>
        <p>
          <span className="text-muted">Drop-off</span> {fmtDate(stay.starts_at, tz)}, {fmtTime(stay.starts_at, tz)}
        </p>
        <p>
          <span className="text-muted">Pick-up</span> {fmtDate(stay.ends_at, tz)}, {fmtTime(stay.ends_at, tz)}
        </p>
        {stay.notes ? <p className="whitespace-pre-wrap text-muted">{stay.notes}</p> : null}
        <p className="mt-1">
          {stay.status === "done" ? <Badge tone="muted">Picked up</Badge> : stay.status === "cancelled" ? <Badge tone="warn">Cancelled</Badge> : here ? <Badge>Staying now</Badge> : <Badge tone="muted">Booked</Badge>}
        </p>
      </Card>

      {here ? (
        <LinkButton href={`/boarding/${stay.id}/update?day=${today}`} className="mb-2 h-14 w-full text-lg" data-todays-update>
          {todays?.posted_at ? "Edit today's update" : "Post today's update"}
        </LinkButton>
      ) : null}
      {stay.status !== "cancelled" ? (
        <LinkButton href={`/boarding/${stay.id}/summary`} variant="secondary" className="h-12 w-full" data-summary-link>
          {stay.status === "done" ? "Stay summary and bill" : "Pick-up: stay summary"}
        </LinkButton>
      ) : null}

      <SectionTitle>Daily updates</SectionTitle>
      {days.length ? (
        <ul className="flex flex-col gap-2">
          {days.map((d) => {
            const u = updates.get(d);
            return (
              <li key={d}>
                <Link href={`/boarding/${stay.id}/update?day=${d}`} className="block" data-update-day={d}>
                  <Card className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block font-medium">{fmtDateKey(d)}</span>
                      <span className="block truncate text-sm text-muted">{u?.posted_at ? u.note || "Posted" : "Not posted yet"}</span>
                    </span>
                    {u?.posted_at ? <Badge>Posted</Badge> : <span className="text-lg text-muted">›</span>}
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">Daily updates start on drop-off day, {fmtDateKey(stay.start_day)}.</p>
      )}

      <SectionTitle>Boarding details</SectionTitle>
      <BoardingAnswers
        pets={pets}
        emergency={client?.emergency_contact ?? null}
        bringing={client?.boarding_bringing ?? null}
        empty={<p className="text-sm text-muted">{client?.name} hasn&apos;t filled these in yet. You can fill them in below.</p>}
      />
      <details className="mt-2">
        <summary className="min-h-11 cursor-pointer py-2 text-accent">Edit boarding details</summary>
        <StayIntakeForm stayId={stay.id} pets={pets} emergency={client?.emergency_contact ?? null} bringing={client?.boarding_bringing ?? null} />
      </details>

      {stay.status === "booked" ? (
        <div className="mt-8">
          <CancelStayButton stayId={stay.id} />
        </div>
      ) : null}
      <BackBar href="/boarding" label="Boarding" />
    </>
  );
}
