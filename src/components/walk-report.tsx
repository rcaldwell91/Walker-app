import type { SupabaseClient } from "@supabase/supabase-js";
import { Card, PageTitle } from "@/components/ui";
import { fmtDate, fmtDuration, fmtTime } from "@/lib/format";
import { EVENT_EMOJI, EVENT_LABELS } from "@/lib/events";
import { PET_SCORES } from "@/lib/pet-scores";
import { fetchGpsLine } from "@/lib/gps";
import { WalkMap } from "@/app/my/walks/[id]/walk-map";

/**
 * A walk report as the viewer's RLS allows: the owner of a pet on it, or the
 * regular walker of a pet someone else covered. Each sees only their own pets'
 * log, ratings, notes and photos (plus whole-group ones), and the shared GPS line.
 */
export async function loadWalkReport(supabase: SupabaseClient, id: string) {
  const { data: walk } = await supabase
    .from("walks")
    .select(
      "id, walker_id, status, started_at, ended_at, distance_m, summary, trail:trails(name), service:service_types(name), walk_dogs(picked_up_at, dropped_off_at, working_on, dog:dogs(id, name)), walk_events(id, kind, note, at, dog_id), photos(id, storage_path, caption, dog_id, photo_pets(dog_id)), dog_notes(id, body, created_at, dog_id), pet_scores(dog_id, category, score)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!walk) return null;
  const paths = (walk.photos ?? []).map((p) => p.storage_path);
  const [line, { data: walkedBy }, signed] = await Promise.all([
    fetchGpsLine(supabase, id),
    supabase.rpc("walk_walker_name", { p_walk: id }),
    paths.length ? supabase.storage.from("photos").createSignedUrls(paths, 3600) : Promise.resolve({ data: [] }),
  ]);
  const urlFor = new Map<string | null, string | null>(((signed.data ?? []) as { path: string | null; signedUrl: string | null }[]).map((s) => [s.path, s.signedUrl]));
  return {
    walk,
    line,
    walkedBy: (walkedBy as string | null) ?? null,
    photos: (walk.photos ?? []).map((p) => ({ ...p, url: urlFor.get(p.storage_path) ?? null })),
  };
}

export type WalkReportData = NonNullable<Awaited<ReturnType<typeof loadWalkReport>>>;

export function WalkReportView({ data, tz, byLine }: { data: WalkReportData; tz: string; byLine?: string | null }) {
  const { walk, line, photos } = data;
  const trail = Array.isArray(walk.trail) ? walk.trail[0] : walk.trail;
  const service = Array.isArray(walk.service) ? walk.service[0] : walk.service;
  const dogs = (walk.walk_dogs ?? [])
    .map((wd) => ({ ...wd, dog: Array.isArray(wd.dog) ? wd.dog[0] : wd.dog }))
    .filter((d) => d.dog);
  const dogName = (dogId: string | null) => dogs.find((d) => d.dog?.id === dogId)?.dog?.name;
  // Which pets a photo shows (tags, or the older single-pet field). Only names this viewer can see.
  const photoPets = (p: { dog_id: string | null; photo_pets?: { dog_id: string }[] | null }) =>
    [...(p.photo_pets ?? []).map((t) => t.dog_id), ...(p.dog_id ? [p.dog_id] : [])].map((id) => dogName(id)).filter((n): n is string => !!n);

  return (
    <>
      <PageTitle sub={`${fmtDate(walk.started_at, tz)} · ${service?.name ?? "Walk"}${trail ? ` · ${trail.name}` : ""}`}>
        {dogs.map((d) => d.dog?.name).join(", ") || "Walk"}
      </PageTitle>
      {byLine ? (
        <p className="-mt-2 mb-4 text-sm font-medium text-accent" data-walked-by>
          {byLine}
        </p>
      ) : null}

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

      {walk.summary ? (
        <Card className="mb-4 whitespace-pre-wrap" data-report-summary>
          {walk.summary}
        </Card>
      ) : null}

      {dogs.map((d) => {
        const id = d.dog!.id;
        const counts = new Map<string, number>();
        for (const e of walk.walk_events ?? []) {
          if (e.dog_id === id && e.kind !== "pickup" && e.kind !== "dropoff" && e.kind !== "note") counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
        }
        const scores = (walk.pet_scores ?? []).filter((s) => s.dog_id === id);
        if (!counts.size && !scores.length && !d.working_on) return null;
        return (
          <Card key={id} className="mb-4 flex flex-col gap-3" data-report-pet={d.dog!.name}>
            <p className="font-medium">{d.dog!.name}</p>
            {counts.size ? (
              <ul className="flex flex-wrap gap-2" aria-label={`${d.dog!.name}'s log`}>
                {[...counts].map(([k, n]) => (
                  <li key={k} className="rounded-full border border-border bg-bg px-3 py-1 text-sm" data-report-log={k}>
                    {EVENT_EMOJI[k] ?? ""} {EVENT_LABELS[k] ?? k}
                    {n > 1 ? ` ×${n}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
            {scores.length ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {PET_SCORES.filter((c) => scores.some((s) => s.category === c.key)).map((c) => {
                  const v = scores.find((s) => s.category === c.key)!.score;
                  return (
                    <div key={c.key} data-report-score={c.key}>
                      <dt className="text-xs text-muted">{c.label}</dt>
                      <dd className="flex items-center gap-2">
                        <span className="flex gap-0.5" aria-hidden="true">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <span key={n} className={`h-2 w-4 rounded-full ${n <= v ? "bg-accent" : "bg-border"}`} />
                          ))}
                        </span>
                        <span>{v}/5</span>
                      </dd>
                    </div>
                  );
                })}
              </dl>
            ) : null}
            {d.working_on ? (
              <p className="text-sm" data-report-working-on>
                <span className="text-muted">Working on:</span> {d.working_on}
              </p>
            ) : null}
          </Card>
        );
      })}

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

      {photos.length ? (
        <>
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Photos</h2>
          <ul className="mb-4 grid grid-cols-2 gap-2" aria-label="Walk photos">
            {photos.map((p) => (
              <li key={p.id} className="relative aspect-square overflow-hidden rounded-xl bg-border" data-report-photo={photoPets(p).join(",")}>
                {p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.url} alt={p.caption ?? photoPets(p).join(", ") ?? "Walk photo"} className="h-full w-full object-cover" loading="lazy" />
                ) : null}
                {photoPets(p).length ? (
                  <span className="absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 text-xs text-white">{photoPets(p).join(", ")}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Timeline</h2>
      <Card>
        <ul className="flex flex-col gap-2 text-sm" aria-label="Timeline">
          {dogs.map((d) =>
            d.picked_up_at ? (
              <li key={`pu-${d.dog?.id}`} className="flex justify-between">
                <span>Picked up {d.dog?.name}</span>
                <span className="text-muted">{fmtTime(d.picked_up_at, tz)}</span>
              </li>
            ) : null,
          )}
          {(walk.walk_events ?? [])
            // Log taps are counted per pet above; the timeline keeps notes.
            .filter((e) => e.kind === "note")
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
    </>
  );
}
