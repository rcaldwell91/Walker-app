import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { fetchGpsLine } from "@/lib/gps";
import { LiveWalk } from "./live-walk";

export default async function WalkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireRole("walker", "operator");
  const { data: walk } = await supabase
    .from("walks")
    .select("id, status, started_at, pickup_order, trail:trails(name), service:service_types(name, log_buttons), walk_dogs(picked_up_at, dropped_off_at, dog:dogs(id, name, working_on, progress_summary, quirks, client_id, client:clients(id, name, color, lat, lng, home_access_notes))), walk_events(id, kind, note, at, dog_id), dog_notes(id, body, dog_id, created_at), messages(id, kind, client_id, sent_at)")
    .eq("id", id)
    .eq("walker_id", user.id) // someone else's walk with your dogs: see /report/[id]
    .maybeSingle();
  if (!walk) notFound();
  if (walk.status === "done") redirect(`/walk/${id}/done`);
  const line = await fetchGpsLine(supabase, id);

  const service = Array.isArray(walk.service) ? walk.service[0] : walk.service;
  const trail = Array.isArray(walk.trail) ? walk.trail[0] : walk.trail;
  const dogs = (walk.walk_dogs ?? []).map((wd) => {
    const dog = Array.isArray(wd.dog) ? wd.dog[0] : wd.dog;
    const client = dog && (Array.isArray(dog.client) ? dog.client[0] : dog.client);
    return {
      id: dog!.id,
      name: dog!.name,
      working_on: dog!.working_on,
      progress_summary: dog!.progress_summary,
      quirks: dog!.quirks,
      clientId: client?.id ?? dog!.client_id,
      clientName: client?.name ?? "",
      clientColor: client?.color ?? null,
      homeNotes: client?.home_access_notes ?? null,
      clientLat: client?.lat ?? null,
      clientLng: client?.lng ?? null,
      picked_up_at: wd.picked_up_at,
      dropped_off_at: wd.dropped_off_at,
    };
  });

  return (
    <LiveWalk
      walk={{
        id: walk.id,
        started_at: walk.started_at!,
        serviceName: service?.name ?? "Walk",
        trailName: trail?.name ?? null,
        buttons: (service?.log_buttons as string[]) ?? ["poop", "pee", "water", "note"],
        pickupOrder: walk.pickup_order ?? [],
      }}
      initialLine={line}
      dogs={dogs}
      events={(walk.walk_events ?? []).sort((a, b) => b.at.localeCompare(a.at))}
      notes={walk.dog_notes ?? []}
      messages={walk.messages ?? []}
    />
  );
}
