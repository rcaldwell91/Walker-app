import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { fetchGpsLine } from "@/lib/gps";
import { LiveWalk } from "./live-walk";

/** Stages 1 (before: picking up) and 2 (walking). Stage 3 is /walk/[id]/end. */
export default async function WalkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireRole("walker", "operator");
  const { data: walk } = await supabase
    .from("walks")
    .select(
      "id, status, started_at, walking_at, wrapup_at, pickup_order, trail:trails(name), service:service_types(name), walk_dogs(picked_up_at, dog:dogs(id, name, working_on, quirks, client_id, client:clients(id, name, color, lat, lng, home_access_notes))), walk_events(id, kind, note, at), photos(id), messages(id, kind, client_id, sent_at)",
    )
    .eq("id", id)
    .eq("walker_id", user.id) // someone else's walk with your pets: see /report/[id]
    .maybeSingle();
  if (!walk) notFound();
  if (walk.status === "done") redirect(`/walk/${id}/done`);
  if (walk.wrapup_at) redirect(`/walk/${id}/end`);
  const line = await fetchGpsLine(supabase, id);

  const service = Array.isArray(walk.service) ? walk.service[0] : walk.service;
  const trail = Array.isArray(walk.trail) ? walk.trail[0] : walk.trail;
  const pets = (walk.walk_dogs ?? []).map((wd) => {
    const dog = Array.isArray(wd.dog) ? wd.dog[0] : wd.dog;
    const client = dog && (Array.isArray(dog.client) ? dog.client[0] : dog.client);
    return {
      id: dog!.id,
      name: dog!.name,
      working_on: dog!.working_on,
      quirks: dog!.quirks,
      clientId: client?.id ?? dog!.client_id,
      clientName: client?.name ?? "",
      clientColor: client?.color ?? null,
      homeNotes: client?.home_access_notes ?? null,
      clientLat: client?.lat ?? null,
      clientLng: client?.lng ?? null,
      picked_up_at: wd.picked_up_at,
    };
  });

  const { data: me } = await supabase.from("walkers").select("eta_mph").eq("id", user.id).maybeSingle();
  return (
    <LiveWalk
      walk={{
        id: walk.id,
        walkerId: user.id,
        started_at: walk.started_at!,
        walking_at: walk.walking_at,
        serviceName: service?.name ?? "Walk",
        trailName: trail?.name ?? null,
        pickupOrder: walk.pickup_order ?? [],
        etaMph: me?.eta_mph ?? 25,
      }}
      initialLine={line}
      pets={pets}
      notes={(walk.walk_events ?? []).filter((e) => e.kind === "note").map((e) => ({ id: e.id, note: e.note ?? "", at: e.at }))}
      photoCount={(walk.photos ?? []).length}
      messages={walk.messages ?? []}
    />
  );
}
