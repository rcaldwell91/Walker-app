"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { PET_SCORES } from "@/lib/pet-scores";
import { fetchGpsLine } from "@/lib/gps";
import { pathDistanceM } from "@/lib/geo/distance";
import { splitMinutes } from "@/lib/hours";
import { clientProfileId, notify, walkAudience } from "@/lib/notify";

export type ActionState = { error?: string } | undefined;

export async function startWalk(_: ActionState, form: FormData): Promise<ActionState> {
  const dogIds = form.getAll("dog_id").map(String).filter(Boolean);
  const serviceTypeId = String(form.get("service_type_id") ?? "");
  const trailId = String(form.get("trail_id") ?? "") || null;
  if (!dogIds.length) return { error: "Pick at least one pet" };
  if (!serviceTypeId) return { error: "Pick a service" };

  const { supabase, user } = await requireRole("walker", "operator");

  const { data: existing } = await supabase.from("walks").select("id").eq("walker_id", user.id).eq("status", "in_progress").maybeSingle();
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
    return { error: `Couldn't add the pets to the walk: ${dErr.message}` };
  }
  redirect(`/walk/${walk.id}`);
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
  if (kind !== "picked_up") {
    const { data: me } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    await notify([await clientProfileId(clientId)], {
      kind: "status",
      title: me?.full_name ?? "Your walker",
      body: bodies[kind],
      url: `/my/walks/${walkId}`,
    });
  }
  revalidatePath(`/walk/${walkId}`);
}

export async function saveGpsPoints(walkId: string, points: { at: string; lat: number; lng: number; accuracy_m?: number }[]) {
  if (!points.length) return;
  const { supabase } = await requireRole("walker", "operator");
  await supabase.from("gps_points").upsert(points.map((p) => ({ walk_id: walkId, ...p })), { onConflict: "walk_id,at" });
}

/** Stage 1 → 2: everyone's picked up, the walk itself starts. Anyone not tapped counts as picked up now. */
export async function startWalking(walkId: string) {
  const { supabase, user } = await requireRole("walker", "operator");
  const now = new Date().toISOString();
  const { data } = await supabase.from("walks").update({ walking_at: now }).eq("id", walkId).eq("walker_id", user.id).is("walking_at", null).select("id");
  if (data?.length) await supabase.from("walk_dogs").update({ picked_up_at: now }).eq("walk_id", walkId).is("picked_up_at", null);
  revalidatePath(`/walk/${walkId}`);
}

/** Stage 2 → 3: "End walk". The walk's end time is now, not when the wrap-up is finished. */
export async function endWalking(walkId: string) {
  const { supabase, user } = await requireRole("walker", "operator");
  await supabase.from("walks").update({ wrapup_at: new Date().toISOString() }).eq("id", walkId).eq("walker_id", user.id).is("wrapup_at", null);
  redirect(`/walk/${walkId}/end`);
}

/** A quick note during the walk. It's on the report, and shows in the wrap-up to fold into the summary. */
export async function addQuickNote(walkId: string, text: string) {
  const note = text.trim().slice(0, 2000);
  if (!note) return { error: "Say or type something first" };
  const { supabase } = await requireRole("walker", "operator");
  const { error } = await supabase.from("walk_events").insert({ walk_id: walkId, kind: "note", dog_id: null, note });
  revalidatePath(`/walk/${walkId}`);
  return error ? { error: error.message } : {};
}

const wrapUpSchema = z.object({
  pets: z
    .array(
      z.object({
        id: z.string().uuid(),
        counts: z.record(z.string(), z.number().int().min(0).max(20)),
        scores: z.record(z.string(), z.number().int().min(1).max(5)),
        workingOn: z.string().max(500).optional(),
      }),
    )
    .max(30),
  photos: z.array(z.object({ id: z.string().uuid(), petIds: z.array(z.string().uuid()).max(30) })).max(200),
  summary: z.string().max(5000),
});
export type WrapUpPayload = z.infer<typeof wrapUpSchema>;

/**
 * Stage 3 → done. Everything in the wrap-up is saved here and nowhere else:
 * the log taps, ratings, "working on", which pets each photo shows, and the
 * summary. Owners see the report (and the photos) from this moment.
 */
export async function finishWalk(walkId: string, payload: WrapUpPayload): Promise<{ error?: string }> {
  const parsed = wrapUpSchema.safeParse(payload);
  if (!parsed.success) return { error: "Something in the wrap-up didn't look right. Check it and try again." };
  const w = parsed.data;
  const { supabase, user } = await requireRole("walker", "operator");
  const { data: walk } = await supabase
    .from("walks")
    .select("id, status, started_at, walking_at, wrapup_at, service:service_types(log_buttons), walk_dogs(dog_id, picked_up_at, dog:dogs(walker_id))")
    .eq("id", walkId)
    .eq("walker_id", user.id)
    .maybeSingle();
  if (!walk) return { error: "That walk isn't yours" };
  if (walk.status === "done") redirect(`/walk/${walkId}/done`); // a second tap on Finish

  const endedAt = walk.wrapup_at ?? new Date().toISOString();
  const onWalk = new Map(
    (walk.walk_dogs ?? []).map((wd) => {
      const dog = Array.isArray(wd.dog) ? wd.dog[0] : wd.dog;
      return [wd.dog_id, dog?.walker_id === user.id] as const; // true = your own pet
    }),
  );
  const service = Array.isArray(walk.service) ? walk.service[0] : walk.service;
  const buttons = new Set(((service?.log_buttons as string[]) ?? []).filter((b) => b !== "note"));
  const scoreKeys = new Set(PET_SCORES.map((s) => s.key as string));

  const events: { dog_id: string; kind: string }[] = [];
  const scores: { dog_id: string; category: string; score: number }[] = [];
  const working: { dog_id: string; text: string }[] = [];
  for (const pet of w.pets) {
    if (!onWalk.has(pet.id)) continue;
    for (const [kind, n] of Object.entries(pet.counts)) {
      if (!buttons.has(kind)) continue;
      for (let i = 0; i < n; i++) events.push({ dog_id: pet.id, kind });
    }
    for (const [category, score] of Object.entries(pet.scores)) {
      if (scoreKeys.has(category)) scores.push({ dog_id: pet.id, category, score });
    }
    // "Working on" is the pet's own walker's; a covering walker doesn't change it.
    if (onWalk.get(pet.id) && pet.workingOn !== undefined) working.push({ dog_id: pet.id, text: pet.workingOn.trim() });
  }

  // Which pets each photo shows. No tags = a group photo everyone on the walk sees.
  const { data: ownPhotos } = await supabase.from("photos").select("id").eq("walk_id", walkId).eq("walker_id", user.id);
  const photoIds = new Set((ownPhotos ?? []).map((p) => p.id));
  const tags = w.photos
    .filter((p) => photoIds.has(p.id))
    .map((p) => ({ photo_id: p.id, dog_ids: p.petIds.filter((id) => onWalk.has(id)) }));

  // Driving: start → "Start walking" (or the last pickup, on older walks). Walking: from there to "End walk".
  const { driveMinutes, walkMinutes } = walk.walking_at
    ? splitMinutes(walk.started_at ?? null, [walk.walking_at], endedAt)
    : splitMinutes(walk.started_at ?? null, (walk.walk_dogs ?? []).map((wd) => wd.picked_up_at), endedAt);
  const line = await fetchGpsLine(supabase, walkId);
  const distance = line.length > 1 ? Math.round(pathDistanceM(line)) : null;
  const summary = w.summary.trim() || null;

  // All of it in one transaction (migration 0019): nothing half-saved, and a second tap does nothing.
  const { data: result, error } = await supabase.rpc("finish_walk", {
    p_walk: walkId,
    p_events: events,
    p_scores: scores,
    p_working: working,
    p_tags: tags,
    p_summary: summary ?? "",
    p_distance_m: distance,
    p_drive_minutes: driveMinutes,
    p_walk_minutes: walkMinutes,
    p_ended_at: endedAt,
  });
  if (error) return { error: `Couldn't save the wrap-up: ${error.message}` };
  if (result === "already done") redirect(`/walk/${walkId}/done`);

  // Report ready: owners get it; on a covered walk, so does the pets' own walker.
  const { owners, otherWalkers } = await walkAudience(walkId);
  await notify(owners, { kind: "report", title: "Walk report ready", body: summary?.slice(0, 140) ?? "See how the walk went.", url: `/my/walks/${walkId}` });
  await notify(otherWalkers, { kind: "report", title: "Covered walk report ready", body: "See how the covered walk went.", url: `/report/${walkId}` });
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
