import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { Card, PageTitle } from "@/components/ui";
import { fmtDate, fmtDuration, fmtTime } from "@/lib/format";
import { EVENT_LABELS } from "@/lib/events";
import { fetchGpsLine } from "@/lib/gps";
import { getTimeZone } from "@/lib/timezone";
import { WalkMap } from "./walk-map";
import { RateWalkForm, TipForm, TipThanks } from "../../relationship-forms";
import { Stars } from "@/components/score-input";

export default async function ClientWalkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireRole("client");
  const tz = await getTimeZone();
  const { data: walk } = await supabase
    .from("walks")
    .select("id, status, started_at, ended_at, distance_m, summary, walker:walkers(business_name, tips_enabled, profile:profiles(full_name)), trail:trails(name), service:service_types(name), walk_dogs(picked_up_at, dropped_off_at, dog:dogs(id, name)), walk_events(id, kind, note, at, dog_id), photos(id, storage_path, caption), dog_notes(id, body, created_at, dog_id)")
    .eq("id", id)
    .maybeSingle();
  if (!walk) notFound();
  const [line, { data: myRating }, { data: myTip }] = await Promise.all([
    fetchGpsLine(supabase, id),
    // Clients can only ever read ratings they gave (target = walker); see RLS.
    supabase.from("ratings").select("score, comment").eq("walk_id", id).eq("target", "walker").maybeSingle(),
    supabase.from("tips").select("amount_cents").eq("walk_id", id).neq("status", "cancelled").maybeSingle(),
  ]);
  const walker = Array.isArray(walk.walker) ? walk.walker[0] : walk.walker;
  const walkerProfile = walker && (Array.isArray(walker.profile) ? walker.profile[0] : walker.profile);
  const walkerName = walker?.business_name || walkerProfile?.full_name || "your walker";
  const done = walk.status === "done";

  const trail = Array.isArray(walk.trail) ? walk.trail[0] : walk.trail;
  const service = Array.isArray(walk.service) ? walk.service[0] : walk.service;
  const dogs = (walk.walk_dogs ?? []).map((wd) => ({ ...wd, dog: Array.isArray(wd.dog) ? wd.dog[0] : wd.dog }));
  const dogName = (dogId: string | null) => dogs.find((d) => d.dog?.id === dogId)?.dog?.name;

  return (
    <>
      <PageTitle sub={`${fmtDate(walk.started_at, tz)} · ${service?.name}${trail ? ` · ${trail.name}` : ""}`}>
        {dogs.map((d) => d.dog?.name).join(", ")}
      </PageTitle>

      <Card className="mb-4 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-muted">Started</p>
          <p className="font-medium">{fmtTime(walk.started_at, tz) || "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Time</p>
          <p className="font-medium">
            {walk.status === "in_progress" ? "In progress" : fmtDuration(walk.started_at, walk.ended_at) || "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">Distance</p>
          <p className="font-medium">{walk.distance_m ? `${(walk.distance_m / 1609).toFixed(1)} mi` : "—"}</p>
        </div>
      </Card>

      <WalkMap walkId={walk.id} initialLine={line} live={walk.status === "in_progress"} />

      {walk.summary ? <Card className="mb-4 whitespace-pre-wrap">{walk.summary}</Card> : null}

      {walk.dog_notes?.length ? (
        <>
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Notes</h2>
          <ul className="mb-4 flex flex-col gap-2">
            {walk.dog_notes.map((n) => (
              <li key={n.id}>
                <Card>
                  <p className="text-xs text-muted">{dogName(n.dog_id)}</p>
                  <p className="whitespace-pre-wrap">{n.body}</p>
                </Card>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Timeline</h2>
      <Card>
        <ul className="flex flex-col gap-2 text-sm">
          {dogs.map((d) =>
            d.picked_up_at ? (
              <li key={`pu-${d.dog?.id}`} className="flex justify-between">
                <span>Picked up {d.dog?.name}</span>
                <span className="text-muted">{fmtTime(d.picked_up_at, tz)}</span>
              </li>
            ) : null,
          )}
          {(walk.walk_events ?? [])
            .sort((a, b) => a.at.localeCompare(b.at))
            .map((e) => (
              <li key={e.id} className="flex justify-between">
                <span>
                  {dogName(e.dog_id) ? `${dogName(e.dog_id)}: ` : ""}
                  {EVENT_LABELS[e.kind] ?? e.kind}
                  {e.note ? ` — ${e.note}` : ""}
                </span>
                <span className="text-muted">{fmtTime(e.at, tz)}</span>
              </li>
            ))}
          {dogs.map((d) =>
            d.dropped_off_at ? (
              <li key={`do-${d.dog?.id}`} className="flex justify-between">
                <span>Dropped off {d.dog?.name}</span>
                <span className="text-muted">{fmtTime(d.dropped_off_at, tz)}</span>
              </li>
            ) : null,
          )}
        </ul>
      </Card>
      {done ? (
        <>
          <h2 className="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-muted">Rate this walk</h2>
          <Card className="mb-4">
            {myRating ? (
              <p data-my-rating={myRating.score}>
                You rated it <Stars score={myRating.score} />
                {myRating.comment ? <span className="mt-1 block text-sm text-muted">“{myRating.comment}”</span> : null}
              </p>
            ) : (
              <RateWalkForm walkId={walk.id} walkerName={walkerName} />
            )}
          </Card>

          {walker?.tips_enabled || myTip ? (
            <>
              <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Leave a tip</h2>
              <Card>{myTip ? <TipThanks amount={myTip.amount_cents / 100} /> : <TipForm walkId={walk.id} />}</Card>
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}
