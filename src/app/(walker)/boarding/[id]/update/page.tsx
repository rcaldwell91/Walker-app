import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { getTimeZone } from "@/lib/timezone";
import { dateKey, fmtDateKey, isDateKey } from "@/lib/time";
import { STAY_BUTTONS } from "@/lib/boarding";
import { DailyUpdate } from "./daily-update";

/** One day's update on a stay: the wrap-up, cut down. Owners see it once it's posted. */
export default async function StayUpdatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ day?: string }> }) {
  const { id } = await params;
  const { day: rawDay } = await searchParams;
  const { supabase, user } = await requireRole("walker", "operator");
  const tz = await getTimeZone();
  const today = dateKey(new Date(), tz);
  const day = isDateKey(rawDay) ? rawDay : today;
  const { data: stay } = await supabase
    .from("boarding_stays")
    .select("id, start_day, end_day, status, client:clients(name), stay_pets(dog:dogs(id, name))")
    .eq("id", id)
    .eq("walker_id", user.id)
    .maybeSingle();
  if (!stay) notFound();
  if (day < stay.start_day || day > stay.end_day || day > today || stay.status === "cancelled") redirect(`/boarding/${id}`);

  // One update per stay per day: make today's row (nothing is shown to the owner until it's posted).
  await supabase.from("stay_updates").upsert({ stay_id: id, walker_id: user.id, day }, { onConflict: "stay_id,day", ignoreDuplicates: true });
  const { data: upd } = await supabase
    .from("stay_updates")
    .select("id, note, posted_at, stay_update_logs(dog_id, kind, count), pet_scores(dog_id, category, score), photos(id, storage_path, photo_pets(dog_id))")
    .eq("stay_id", id)
    .eq("day", day)
    .single();
  if (!upd) notFound();

  const client = Array.isArray(stay.client) ? stay.client[0] : stay.client;
  const pets = (stay.stay_pets ?? []).map((sp) => (Array.isArray(sp.dog) ? sp.dog[0] : sp.dog)).filter((d): d is NonNullable<typeof d> => !!d);
  const paths = (upd.photos ?? []).map((p) => p.storage_path);
  const { data: signed } = paths.length ? await supabase.storage.from("photos").createSignedUrls(paths, 3600) : { data: [] };
  const urlFor = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const saved = Object.fromEntries(
    pets.map((p) => [
      p.id,
      {
        counts: Object.fromEntries((upd.stay_update_logs ?? []).filter((l) => l.dog_id === p.id).map((l) => [l.kind, l.count])),
        scores: Object.fromEntries((upd.pet_scores ?? []).filter((s) => s.dog_id === p.id).map((s) => [s.category, s.score])),
      },
    ]),
  );

  return (
    <DailyUpdate
      stayId={id}
      updateId={upd.id}
      walkerId={user.id}
      dayLabel={fmtDateKey(day, { weekday: "long", month: "short", day: "numeric" })}
      clientName={client?.name ?? "the owner"}
      posted={!!upd.posted_at}
      buttons={STAY_BUTTONS}
      pets={pets.map((p) => ({ id: p.id, name: p.name }))}
      saved={saved}
      note={upd.note ?? ""}
      photos={(upd.photos ?? []).map((p) => ({ id: p.id, url: urlFor.get(p.storage_path) ?? "", tags: (p.photo_pets ?? []).map((t) => t.dog_id) }))}
      voiceReady={!!process.env.ANTHROPIC_API_KEY}
    />
  );
}
