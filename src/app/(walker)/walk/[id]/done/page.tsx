import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { fmtDuration, fmtTime } from "@/lib/format";
import { EVENT_LABELS } from "@/lib/events";

export default async function WalkDonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireRole("walker", "operator");
  const { data: walk } = await supabase
    .from("walks")
    .select("id, started_at, ended_at, distance_m, summary, walk_dogs(dog:dogs(name)), walk_events(kind, dog_id)")
    .eq("id", id)
    .maybeSingle();
  if (!walk) notFound();

  const names = (walk.walk_dogs ?? []).map((wd) => (Array.isArray(wd.dog) ? wd.dog[0] : wd.dog)?.name).filter(Boolean);
  const counts: Record<string, number> = {};
  for (const e of (walk.walk_events ?? []) as { kind: string }[]) {
    if (e.kind !== "pickup" && e.kind !== "dropoff") counts[e.kind] = (counts[e.kind] ?? 0) + 1;
  }

  return (
    <>
      <PageTitle sub={`${fmtTime(walk.started_at)} – ${fmtTime(walk.ended_at)} · ${fmtDuration(walk.started_at, walk.ended_at)}`}>
        Nice walk with {names.join(", ")}
      </PageTitle>
      <Card className="mb-4">
        {walk.distance_m ? <p>{(walk.distance_m / 1609).toFixed(1)} miles</p> : null}
        {Object.keys(counts).length ? (
          <p className="text-sm text-muted">
            {Object.entries(counts).map(([k, n]) => `${EVENT_LABELS[k] ?? k} ×${n}`).join(" · ")}
          </p>
        ) : null}
        {walk.summary ? <p className="mt-2 whitespace-pre-wrap text-sm">{walk.summary}</p> : null}
      </Card>
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
