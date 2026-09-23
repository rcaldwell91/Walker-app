"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/session";

export type FormState = { error?: string; done?: number } | undefined;

const score = z.coerce.number().int().min(1, "Pick 1 to 5").max(5, "Pick 1 to 5");

const checkInSchema = z.object({
  walker_satisfaction: score,
  app_satisfaction: score,
  dog_progress: z.string().trim().max(2000).optional(),
  at_home_training: z.string().trim().max(2000).optional(),
  requests: z.string().trim().max(2000).optional(),
});

export async function answerCheckIn(checkInId: string, _: FormState, form: FormData): Promise<FormState> {
  const parsed = checkInSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { supabase } = await requireRole("client");
  const { data, error } = await supabase
    .from("check_ins")
    .update({ answers: parsed.data, responded_at: new Date().toISOString() })
    .eq("id", checkInId)
    .is("responded_at", null)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That check-in is already answered" };
  // No revalidate: the card stays on screen to say thanks. /my and /my/more
  // are dynamic, so they load fresh answers on the next visit anyway.
  return { done: Date.now() };
}

/**
 * Suggestion box. Anonymous by default: the row gets no client id, and
 * nothing here records who sent it.
 */
export async function sendSuggestion(walkerId: string, _: FormState, form: FormData): Promise<FormState> {
  const body = String(form.get("body") ?? "").trim();
  if (!body) return { error: "Write something first" };
  if (body.length > 2000) return { error: "Keep it under 2,000 characters" };
  const signed = form.get("signed") === "on";
  const { supabase, user } = await requireRole("client");

  let clientId: string | null = null;
  if (signed) {
    const { data: me } = await supabase
      .from("clients")
      .select("id")
      .eq("walker_id", walkerId)
      .eq("profile_id", user.id)
      .maybeSingle();
    if (!me) return { error: "You can only send suggestions to your own walker" };
    clientId = me.id;
  }
  const { error } = await supabase
    .from("suggestions")
    .insert({ walker_id: walkerId, body, is_anonymous: !signed, client_id: clientId });
  if (error) return { error: "Couldn't send that. Suggestions are for active clients when the walker has the box on." };
  return { done: Date.now() };
}

const rateSchema = z.object({ score, comment: z.string().trim().max(1000).optional() });

export async function rateWalk(walkId: string, _: FormState, form: FormData): Promise<FormState> {
  const parsed = rateSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { supabase, user } = await requireRole("client");
  const target = await myClientForWalk(walkId);
  if ("error" in target) return target;
  const { error } = await supabase.from("ratings").insert({
    walker_id: target.walkerId,
    client_id: target.clientId,
    target: "walker",
    rater_profile_id: user.id,
    walk_id: walkId,
    score: parsed.data.score,
    comment: parsed.data.comment || null,
  });
  if (error) return { error: error.code === "23505" ? "You've already rated this walk" : error.message };
  revalidatePath(`/my/walks/${walkId}`);
  return { done: Date.now() };
}

export async function leaveTip(walkId: string, _: FormState, form: FormData): Promise<FormState> {
  const dollars = Number(String(form.get("amount") ?? "").replace(/[$,\s]/g, ""));
  if (!Number.isFinite(dollars) || dollars < 1) return { error: "Tips start at $1" };
  if (dollars > 500) return { error: "That's more than we can record as a tip" };
  const { supabase } = await requireRole("client");
  const target = await myClientForWalk(walkId);
  if ("error" in target) return target;
  const { error } = await supabase.from("tips").insert({
    walker_id: target.walkerId,
    client_id: target.clientId,
    walk_id: walkId,
    amount_cents: Math.round(dollars * 100),
  });
  if (error) return { error: error.code === "23505" ? "You've already left a tip for this walk" : error.message };
  revalidatePath(`/my/walks/${walkId}`);
  return { done: Date.now() };
}

/** The signed-in client's row (and walker) for a finished walk their dog was on. */
async function myClientForWalk(walkId: string): Promise<{ walkerId: string; clientId: string } | { error: string }> {
  const { supabase, user } = await requireRole("client");
  const { data: walk } = await supabase
    .from("walks")
    .select("walker_id, status, walk_dogs(dog:dogs(client_id))")
    .eq("id", walkId)
    .maybeSingle();
  if (!walk) return { error: "Walk not found" };
  if (walk.status !== "done") return { error: "You can do this once the walk is over" };
  const clientIds = (walk.walk_dogs ?? []).map((wd) => (Array.isArray(wd.dog) ? wd.dog[0] : wd.dog)?.client_id).filter(Boolean);
  const { data: me } = await supabase
    .from("clients")
    .select("id")
    .eq("profile_id", user.id)
    .eq("walker_id", walk.walker_id)
    .in("id", clientIds as string[])
    .maybeSingle();
  if (!me) return { error: "Walk not found" };
  return { walkerId: walk.walker_id, clientId: me.id };
}
