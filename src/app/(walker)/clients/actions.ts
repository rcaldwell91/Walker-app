"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { saveClientCoordinates } from "@/lib/geo/geocode";

export type ActionState = { error?: string } | undefined;

const NOT_ON_MAP = "Couldn't find that address on the map. Check it and save again.";

const clientSchema = z.object({
  name: z.string().min(1, "Enter the client's name"),
  email: z.string().email("Enter a valid email").or(z.literal("")).optional(),
  phone: z.string().optional(),
  address_line: z.string().optional(),
  city: z.string().optional(),
  home_access_notes: z.string().optional(),
  group_label: z.string().optional(),
  color: z.string().optional(),
  dog_name: z.string().optional(),
});

export async function createClientAction(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = clientSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { supabase, user } = await requireRole("walker", "operator");
  const { dog_name, ...d } = parsed.data;

  const { data: client, error } = await supabase
    .from("clients")
    .insert({ ...d, email: d.email || null, walker_id: user.id })
    .select("id")
    .single();
  if (error || !client) return { error: error?.message ?? "Couldn't save" };

  // The client is saved at this point, so a dog or invite failure is reported on
  // their page (which has "Add a dog" and "Make a new link") rather than here.
  const problems: string[] = [];
  if (dog_name?.trim()) {
    const { error: dErr } = await supabase
      .from("dogs")
      .insert({ client_id: client.id, walker_id: user.id, name: dog_name.trim() });
    if (dErr) problems.push(`Couldn't add ${dog_name.trim()}: ${dErr.message}`);
  }
  const { error: iErr } = await supabase.from("client_invites").insert({ walker_id: user.id, client_id: client.id });
  if (iErr) problems.push(`Couldn't make their invite link: ${iErr.message}`);

  if (!(await saveClientCoordinates(supabase, client.id, d.address_line, d.city))) {
    problems.push(NOT_ON_MAP);
  }

  const q = problems.length ? `?error=${encodeURIComponent(problems.join(" "))}` : "";
  redirect(`/clients/${client.id}${q}`);
}

export async function updateClientAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  const parsed = clientSchema.omit({ dog_name: true }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { supabase } = await requireRole("walker", "operator");
  const { data: before } = await supabase.from("clients").select("address_line, city, lat").eq("id", id).maybeSingle();
  const { error } = await supabase
    .from("clients")
    .update({ ...parsed.data, email: parsed.data.email || null })
    .eq("id", id);
  if (error) return { error: error.message };

  // Only hit the geocoder when the address changed (or never got placed).
  const d = parsed.data;
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
  if (!name) return { error: "Enter the dog's name" };
  const { supabase, user } = await requireRole("walker", "operator");
  const { data, error } = await supabase
    .from("dogs")
    .insert({ client_id: clientId, walker_id: user.id, name })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Couldn't save" };
  redirect(`/dogs/${data.id}`);
}
