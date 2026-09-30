import type { SupabaseClient } from "@supabase/supabase-js";
import { Card } from "@/components/ui";
import { EVENT_EMOJI, EVENT_LABELS } from "@/lib/events";
import { PET_SCORES } from "@/lib/pet-scores";
import { fmtDateKey } from "@/lib/time";

export type DiaryDay = {
  id: string;
  day: string;
  note: string | null;
  logs: { dog_id: string; kind: string; count: number }[];
  scores: { dog_id: string; category: string; score: number }[];
  photos: { id: string; url: string; tags: string[] }[];
};

/**
 * Posted daily updates for a stay, newest first, with signed photo URLs. RLS
 * decides what the viewer gets: an owner only ever receives posted days.
 */
export async function loadDiary(supabase: SupabaseClient, stayId: string): Promise<DiaryDay[]> {
  const { data } = await supabase
    .from("stay_updates")
    .select("id, day, note, posted_at, stay_update_logs(dog_id, kind, count), pet_scores(dog_id, category, score), photos(id, storage_path, photo_pets(dog_id))")
    .eq("stay_id", stayId)
    .not("posted_at", "is", null)
    .order("day", { ascending: false });
  const rows = data ?? [];
  const paths = rows.flatMap((r) => (r.photos ?? []).map((p: { storage_path: string }) => p.storage_path));
  const { data: signed } = paths.length ? await supabase.storage.from("photos").createSignedUrls(paths, 3600) : { data: [] };
  const urlFor = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return rows.map((r) => ({
    id: r.id,
    day: r.day,
    note: r.note,
    logs: r.stay_update_logs ?? [],
    scores: r.pet_scores ?? [],
    photos: (r.photos ?? []).map((p: { id: string; storage_path: string; photo_pets: { dog_id: string }[] | null }) => ({
      id: p.id,
      url: urlFor.get(p.storage_path) ?? "",
      tags: (p.photo_pets ?? []).map((t) => t.dog_id),
    })),
  }));
}

export function StayDiary({ days, pets }: { days: DiaryDay[]; pets: { id: string; name: string }[] }) {
  const nameOf = new Map(pets.map((p) => [p.id, p.name]));
  return (
    <ol className="flex flex-col gap-3" data-diary>
      {days.map((d) => (
        <li key={d.id} data-diary-day={d.day}>
          <Card className="flex flex-col gap-3">
            <p className="font-medium">{fmtDateKey(d.day, { weekday: "long", month: "short", day: "numeric" })}</p>
            {d.note ? <p className="whitespace-pre-wrap">{d.note}</p> : null}
            {pets.map((p) => {
              const logs = d.logs.filter((l) => l.dog_id === p.id);
              const scores = d.scores.filter((s) => s.dog_id === p.id);
              if (!logs.length && !scores.length) return null;
              return (
                <div key={p.id} className="text-sm">
                  {pets.length > 1 ? <p className="mb-1 font-medium">{p.name}</p> : null}
                  {logs.length ? (
                    <p className="flex flex-wrap gap-1">
                      {logs.map((l) => (
                        <span key={l.kind} className="rounded-full border border-border px-2 py-0.5" data-diary-log={l.kind}>
                          {EVENT_EMOJI[l.kind] ?? "•"} {EVENT_LABELS[l.kind] ?? l.kind}
                          {l.count > 1 ? ` ×${l.count}` : ""}
                        </span>
                      ))}
                    </p>
                  ) : null}
                  {scores.length ? (
                    <p className="mt-1 text-muted">
                      {PET_SCORES.filter((sc) => scores.some((s) => s.category === sc.key))
                        .map((sc) => `${sc.label} ${scores.find((s) => s.category === sc.key)!.score}/5`)
                        .join(" · ")}
                    </p>
                  ) : null}
                </div>
              );
            })}
            {d.photos.length ? (
              <ul className="grid grid-cols-2 gap-2">
                {d.photos.map((ph) => (
                  <li key={ph.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ph.url} alt={ph.tags.map((t) => nameOf.get(t)).filter(Boolean).join(" & ") || "Stay photo"} className="aspect-square w-full rounded-xl object-cover" data-diary-photo />
                    {ph.tags.length && pets.length > 1 ? <p className="mt-1 text-xs text-muted">{ph.tags.map((t) => nameOf.get(t)).filter(Boolean).join(" & ")}</p> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        </li>
      ))}
    </ol>
  );
}
