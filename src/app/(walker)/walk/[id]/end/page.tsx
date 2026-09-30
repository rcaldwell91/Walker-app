import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { WrapUp } from "./wrap-up";

/** Stage 3: the wrap-up. Nothing here is saved until the walker taps Finish. */
export default async function WrapUpPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireRole("walker", "operator");
  const { data: walk } = await supabase
    .from("walks")
    .select(
      "id, status, wrapup_at, service:service_types(name, log_buttons), walk_dogs(dropped_off_at, dog:dogs(id, name, working_on, walker_id, client:clients(id, name))), photos(id, storage_path, photo_pets(dog_id)), walk_events(id, kind, note, at), messages(kind, client_id)",
    )
    .eq("id", id)
    .eq("walker_id", user.id) // someone else's walk with your pets: see /report/[id]
    .maybeSingle();
  if (!walk) notFound();
  if (walk.status === "done") redirect(`/walk/${id}/done`);
  // Came straight here without tapping "End walk": the walk ends now.
  if (!walk.wrapup_at) await supabase.from("walks").update({ wrapup_at: new Date().toISOString() }).eq("id", id).is("wrapup_at", null);

  const service = Array.isArray(walk.service) ? walk.service[0] : walk.service;
  const pets = (walk.walk_dogs ?? [])
    .map((wd) => {
      const d = Array.isArray(wd.dog) ? wd.dog[0] : wd.dog;
      const c = d && (Array.isArray(d.client) ? d.client[0] : d.client);
      return d ? { id: d.id, name: d.name, workingOn: d.working_on ?? "", own: d.walker_id === user.id, clientId: c?.id ?? "", clientName: c?.name ?? "" } : null;
    })
    .filter((p): p is NonNullable<typeof p> => !!p);
  const paths = (walk.photos ?? []).map((p) => p.storage_path);
  const { data: signed } = paths.length ? await supabase.storage.from("photos").createSignedUrls(paths, 3600) : { data: [] };
  const urlFor = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const droppedOff = new Set((walk.messages ?? []).filter((m) => m.kind === "dropped_off").map((m) => m.client_id));

  return (
    <WrapUp
      walkId={walk.id}
      walkerId={user.id}
      serviceName={service?.name ?? "Walk"}
      buttons={((service?.log_buttons as string[]) ?? ["poop", "pee", "water", "treat"]).filter((b) => b !== "note")}
      pets={pets}
      clients={[...new Map(pets.map((p) => [p.clientId, { id: p.clientId, name: p.clientName, droppedOff: droppedOff.has(p.clientId) }])).values()]}
      photos={(walk.photos ?? []).map((p) => ({ id: p.id, url: urlFor.get(p.storage_path) ?? "", tags: (p.photo_pets ?? []).map((t) => t.dog_id) }))}
      notes={(walk.walk_events ?? []).filter((e) => e.kind === "note" && e.note).map((e) => ({ id: e.id, note: e.note!, at: e.at }))}
      voiceReady={!!process.env.ANTHROPIC_API_KEY}
    />
  );
}
