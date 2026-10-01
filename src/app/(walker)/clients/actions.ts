"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { saveClientCoordinates } from "@/lib/geo/geocode";
import { friendly } from "@/lib/errors";
import { cleanEmail, cleanPhone, looksLikeEmail, toNumber } from "@/lib/input";

export type ActionState = { error?: string } | undefined;

const NOT_ON_MAP = "Couldn't find that address on the map. Check it and save again.";

const clientSchema = z.object({
  name: z.string({ required_error: "Type the client's name" }).trim().min(1, "Type the client's name"),
  email: z.preprocess(
    (v) => cleanEmail(String(v ?? "")),
    z.string().refine((e) => e === "" || looksLikeEmail(e), "Email: type it like name@example.com, or leave it blank"),
  ),
  phone: z.string().optional(),
  address_line: z.string().optional(),
  city: z.string().optional(),
  home_access_notes: z.string().optional(),
  group_label: z.string().optional(),
  color: z.string().optional(),
  dog_name: z.string().optional(),
});

/** Brackets, dashes and spaces in a phone number are fine; stored tidy. */
function withCleanPhone<T extends { phone?: string }>(d: T): { data: T & { phone: string | null } } | { error: string } {
  const { phone, error } = cleanPhone(d.phone ?? "");
  if (error) return { error };
  return { data: { ...d, phone } };
}

export async function createClientAction(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = clientSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const tidy = withCleanPhone(parsed.data);
  if ("error" in tidy) return { error: tidy.error };
  const { supabase, user } = await requireRole("walker", "operator");
  const { dog_name, ...d } = tidy.data;

  const { data: client, error } = await supabase
    .from("clients")
    .insert({ ...d, email: d.email || null, walker_id: user.id })
    .select("id")
    .single();
  if (error || !client) return { error: friendly(error, "Couldn't save. Try again.") };

  // The client is saved at this point, so a dog or invite failure is reported on
  // their page (which has "Add a dog" and "Make a new link") rather than here.
  const problems: string[] = [];
  if (dog_name?.trim()) {
    const { error: dErr } = await supabase
      .from("dogs")
      .insert({ client_id: client.id, walker_id: user.id, name: dog_name.trim() });
    if (dErr) problems.push(`Couldn't add ${dog_name.trim()}. Add them on the client page.`);
  }
  const { error: iErr } = await supabase.from("client_invites").insert({ walker_id: user.id, client_id: client.id });
  if (iErr) problems.push("Couldn't make their invite link. Tap New link on their page.");

  if (!(await saveClientCoordinates(supabase, client.id, d.address_line, d.city))) {
    problems.push(NOT_ON_MAP);
  }

  // One message: the first thing that needs doing.
  const q = problems.length ? `?error=${encodeURIComponent(problems[0])}` : "";
  redirect(`/clients/${client.id}${q}`);
}

export async function updateClientAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  const parsed = clientSchema.omit({ dog_name: true }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const tidy = withCleanPhone(parsed.data);
  if ("error" in tidy) return { error: tidy.error };
  const { supabase } = await requireRole("walker", "operator");
  const { data: before } = await supabase.from("clients").select("address_line, city, lat").eq("id", id).maybeSingle();
  const { error } = await supabase
    .from("clients")
    .update({ ...tidy.data, email: tidy.data.email || null })
    .eq("id", id);
  if (error) return { error: friendly(error) };

  // Only hit the geocoder when the address changed (or never got placed).
  const d = tidy.data;
  const moved = (before?.address_line ?? "") !== (d.address_line ?? "") || (before?.city ?? "") !== (d.city ?? "");
  let q = "";
  if (moved || (before?.lat == null && (d.address_line || d.city))) {
    if (!(await saveClientCoordinates(supabase, id, d.address_line, d.city))) q = `?error=${encodeURIComponent(NOT_ON_MAP)}`;
  }
  revalidatePath(`/clients/${id}`);
  redirect(`/clients/${id}${q}`);
}

export async function regenerateInvite(clientId: string) {
  const { supabase, user } = await requireRole("walker", "operator");
  await supabase.from("client_invites").delete().eq("client_id", clientId).is("redeemed_at", null);
  await supabase.from("client_invites").insert({ walker_id: user.id, client_id: clientId });
  revalidatePath(`/clients/${clientId}`);
}

export async function addDogAction(clientId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Type the pet's name" };
  const { supabase, user } = await requireRole("walker", "operator");
  const { data, error } = await supabase
    .from("dogs")
    .insert({ client_id: clientId, walker_id: user.id, name })
    .select("id")
    .single();
  if (error || !data) return { error: friendly(error, "Couldn't save. Try again.") };
  redirect(`/pets/${data.id}`);
}

const clientRatingSchema = z.object({
  score: z.preprocess(
    (v) => toNumber(v) ?? undefined,
    z
      .number({ required_error: "Tap a number from 1 to 5", invalid_type_error: "Tap a number from 1 to 5" })
      .int("Tap a number from 1 to 5")
      .min(1, "Tap a number from 1 to 5")
      .max(5, "Tap a number from 1 to 5"),
  ),
  comment: z.string().trim().max(1000).optional(),
});

/** Private: clients can never read ratings about themselves (RLS on ratings). */
export type RatingState = { error?: string; done?: number } | undefined;

export async function rateClient(clientId: string, _: RatingState, form: FormData): Promise<RatingState> {
  const parsed = clientRatingSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { supabase, user } = await requireRole("walker", "operator");
  const { error } = await supabase.from("ratings").insert({
    walker_id: user.id,
    client_id: clientId,
    target: "client",
    rater_profile_id: user.id,
    score: parsed.data.score,
    comment: parsed.data.comment || null,
  });
  if (error) return { error: friendly(error) };
  revalidatePath(`/clients/${clientId}`);
  return { done: Date.now() };
}
