"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { fetchGpsLine } from "@/lib/gps";
import { pathDistanceM } from "@/lib/geo/distance";

export type ActionState = { error?: string } | undefined;

export async function startWalk(_: ActionState, form: FormData): Promise<ActionState> {
  const dogIds = form.getAll("dog_id").map(String).filter(Boolean);
  const serviceTypeId = String(form.get("service_type_id") ?? "");
  const trailId = String(form.get("trail_id") ?? "") || null;
  if (!dogIds.length) return { error: "Pick at least one dog" };
  if (!serviceTypeId) return { error: "Pick a service" };

  const { supabase, user } = await requireRole("walker", "operator");

  const { data: existing } = await supabase.from("walks").select("id").eq("status", "in_progress").maybeSingle();
  if (existing) redirect(`/walk/${existing.id}`);

  // Pickup order comes from the form (suggested, maybe reordered by the walker). It has to
  // cover exactly the clients whose dogs are on this walk; otherwise fall back to tap order.
  const { data: dogs } = await supabase.from("dogs").select("id, client_id").in("id", dogIds);
  const walkClients = Array.from(new Set((dogs ?? []).map((d) => d.client_id)));
  const chosen = Array.from(new Set(form.getAll("pickup_client_id").map(String)));
  const pickupOrder =
    chosen.length === walkClients.length && chosen.every((id) => walkClients.includes(id)) ? chosen : walkClients;

  const { data: walk, error } = await supabase
    .from("walks")
    .insert({
      walker_id: user.id,
      service_type_id: serviceTypeId,
      trail_id: trailId,
      status: "in_progress",
      started_at: new Date().toISOString(),
      pickup_order: pickupOrder,
    })
    .select("id")
    .single();
  if (error || !walk) return { error: error?.message ?? "Couldn't start" };

  const { error: dErr } = await supabase.from("walk_dogs").insert(dogIds.map((dog_id) => ({ walk_id: walk.id, dog_id })));
  if (dErr) {
    await supabase.from("walks").delete().eq("id", walk.id);
    return { error: `Couldn't add the dogs to the walk: ${dErr.message}` };
  }
  redirect(`/walk/${walk.id}`);
}

export async function logEvent(walkId: string, kind: string, dogId: string | null, note?: string) {
  const { supabase } = await requireRole("walker", "operator");
  await supabase.from("walk_events").insert({ walk_id: walkId, kind, dog_id: dogId, note: note || null });
  revalidatePath(`/walk/${walkId}`);
}

export async function markPickup(walkId: string, dogId: string, which: "picked_up_at" | "dropped_off_at") {
  const { supabase } = await requireRole("walker", "operator");
  await supabase.from("walk_dogs").update({ [which]: new Date().toISOString() }).eq("walk_id", walkId).eq("dog_id", dogId);
  await supabase.from("walk_events").insert({
    walk_id: walkId,
    dog_id: dogId,
    kind: which === "picked_up_at" ? "pickup" : "dropoff",
  });
  revalidatePath(`/walk/${walkId}`);
}

export async function addNote(walkId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const body = String(form.get("body") ?? "").trim();
  const raw = String(form.get("body_raw") ?? "").trim();
  const dogId = String(form.get("dog_id") ?? "") || null;
  if (!body) return { error: "Say or type something first" };
  if (!dogId) return { error: "Pick which dog this is about" };
  const { supabase, user } = await requireRole("walker", "operator");
  const { error } = await supabase.from("dog_notes").insert({
    dog_id: dogId,
    walker_id: user.id,
    walk_id: walkId,
    body,
    source: raw ? "voice" : "typed",
    raw_transcript: raw || null,
  });
  if (error) return { error: error.message };
  revalidatePath(`/walk/${walkId}`);
  return undefined;
}

export async function sendStatus(walkId: string, kind: "on_my_way" | "here" | "picked_up" | "dropped_off", clientId: string, etaMinutes?: number) {
  const { supabase, user } = await requireRole("walker", "operator");
  const bodies = {
    on_my_way: etaMinutes ? `On my way — about ${etaMinutes} min.` : "On my way!",
    here: "I'm here.",
    picked_up: "Got them! Heading out.",
    dropped_off: "Dropped off safe and sound.",
  };
  await supabase.from("messages").insert({
    walker_id: user.id,
    client_id: clientId,
    walk_id: walkId,
    sender_id: user.id,
    kind,
    body: bodies[kind],
    eta_minutes: etaMinutes ?? null,
  });
  revalidatePath(`/walk/${walkId}`);
}

export async function saveGpsPoints(walkId: string, points: { at: string; lat: number; lng: number; accuracy_m?: number }[]) {
  if (!points.length) return;
  const { supabase } = await requireRole("walker", "operator");
  await supabase.from("gps_points").upsert(points.map((p) => ({ walk_id: walkId, ...p })), { onConflict: "walk_id,at" });
}

export async function endWalk(walkId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireRole("walker", "operator");
  const summary = String(form.get("summary") ?? "").trim() || null;
  // Distance comes from the GPS line saved during the walk.
  const line = await fetchGpsLine(supabase, walkId);
  const distance = line.length > 1 ? Math.round(pathDistanceM(line)) : null;

  // Per-dog progress updates: working_on[<dogId>], progress[<dogId>]
  for (const [k, v] of form.entries()) {
    const m = k.match(/^(working_on|progress)\[(.+)\]$/);
    if (!m) continue;
    const col = m[1] === "working_on" ? "working_on" : "progress_summary";
    await supabase.from("dogs").update({ [col]: String(v).trim() }).eq("id", m[2]);
  }

  // Anyone not explicitly dropped off gets dropped off now.
  const now = new Date().toISOString();
  await supabase.from("walk_dogs").update({ dropped_off_at: now }).eq("walk_id", walkId).is("dropped_off_at", null);

  const { data: walk } = await supabase.from("walks").select("started_at").eq("id", walkId).single();
  const walkMinutes = walk?.started_at ? Math.round((Date.now() - new Date(walk.started_at).getTime()) / 60000) : null;

  const { error } = await supabase
    .from("walks")
    .update({ status: "done", ended_at: now, summary, distance_m: distance, walk_minutes: walkMinutes })
    .eq("id", walkId);
  if (error) return { error: error.message };
  revalidatePath("/home");
  redirect(`/walk/${walkId}/done`);
}

export async function fileIncident(walkId: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  const what = String(form.get("what_happened") ?? "").trim();
  if (!what) return { error: "Describe what happened" };
  const { supabase, user } = await requireRole("walker", "operator");
  const { error } = await supabase.from("incidents").insert({
    walker_id: user.id,
    walk_id: walkId,
    dog_id: String(form.get("dog_id") ?? "") || null,
    severity: String(form.get("severity") ?? "minor"),
    what_happened: what,
    action_taken: String(form.get("action_taken") ?? "").trim() || null,
  });
  if (error) return { error: error.message };
  redirect(walkId ? `/walk/${walkId}` : "/home");
}
