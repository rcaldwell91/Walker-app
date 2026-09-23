import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { getTimeZone } from "@/lib/timezone";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { cents, fmtDuration, fmtTime } from "@/lib/format";
import { EVENT_LABELS } from "@/lib/events";
import { fmtHours } from "@/lib/hours";

export default async function WalkDonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireRole("walker", "operator");
  const tz = await getTimeZone();
  const { data: walk } = await supabase
    .from("walks")
    .select("id, started_at, ended_at, distance_m, summary, drive_minutes, walk_minutes, walk_dogs(dog:dogs(name)), walk_events(kind, dog_id), tips(amount_cents, status, client:clients(name))")
    .eq("id", id)
    .eq("walker_id", user.id) // someone else's walk with your dogs: see /report/[id]
    .maybeSingle();
  if (!walk) notFound();

  const names = (walk.walk_dogs ?? []).map((wd) => (Array.isArray(wd.dog) ? wd.dog[0] : wd.dog)?.name).filter(Boolean);
  const counts: Record<string, number> = {};
  for (const e of (walk.walk_events ?? []) as { kind: string }[]) {
    if (e.kind !== "pickup" && e.kind !== "dropoff") counts[e.kind] = (counts[e.kind] ?? 0) + 1;
  }

  return (
    <>
      <PageTitle sub={`${fmtTime(walk.started_at, tz)} – ${fmtTime(walk.ended_at, tz)} · ${fmtDuration(walk.started_at, walk.ended_at)}`}>
        Nice walk with {names.join(", ")}
      </PageTitle>
      <Card className="mb-4">
        {walk.distance_m ? <p>{(walk.distance_m / 1609).toFixed(1)} miles</p> : null}
        {walk.walk_minutes != null ? (
          <p className="text-sm text-muted" data-minutes={`${walk.drive_minutes ?? 0}/${walk.walk_minutes}`}>
            Driving {fmtHours(walk.drive_minutes ?? 0)} · Walking {fmtHours(walk.walk_minutes)}
          </p>
        ) : null}
        {Object.keys(counts).length ? (
          <p className="text-sm text-muted">
            {Object.entries(counts).map(([k, n]) => `${EVENT_LABELS[k] ?? k} ×${n}`).join(" · ")}
          </p>
        ) : null}
        {walk.summary ? <p className="mt-2 whitespace-pre-wrap text-sm">{walk.summary}</p> : null}
      </Card>
      {walk.tips?.length ? (
        <Card className="mb-4">
          <p className="font-medium">Tips</p>
          <ul className="text-sm">
            {walk.tips.map((t, i) => (
              <li key={i}>
                {cents(t.amount_cents)} from {(Array.isArray(t.client) ? t.client[0] : t.client)?.name ?? "a client"}
                {t.status === "pending" ? <span className="text-muted"> · payout once payments are set up</span> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <p className="mb-4 text-sm text-muted">Owners can see this report now.</p>
      <div className="flex flex-col gap-2">
        <LinkButton href={`/walk/${walk.id}/photos`} variant="secondary">
          Add photos
        </LinkButton>
        <LinkButton href="/home">Back to today</LinkButton>
      </div>
    </>
  );
}
