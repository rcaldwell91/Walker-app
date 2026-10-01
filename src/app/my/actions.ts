"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { saveClientCoordinates } from "@/lib/geo/geocode";
import { PET_BOARDING_FIELDS } from "@/lib/boarding";
import { friendly } from "@/lib/errors";
import { cleanPhone, toNumber } from "@/lib/input";

export type ActionState = { error?: string } | undefined;

const intakeSchema = z.object({
  client_id: z.string().uuid(),
  phone: z.string().optional(),
  address_line: z.string().optional(),
  city: z.string().optional(),
  emergency_contact: z.string().optional(),
  home_access_notes: z.string().optional(),
  boarding_bringing: z.string().max(1000, "Keep \"What I'm bringing\" under 1,000 characters").optional(),
});

const dogSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().default(""),
  breed: z.string().optional(),
  sex: z.string().optional(),
  birthdate: z.string().optional(),
  weight_lbs: z.string().optional(),
  vet_name: z.string().optional(),
  vet_phone: z.string().optional(),
  medications: z.string().optional(),
  allergies: z.string().optional(),
  quirks: z.string().optional(),
});

export async function submitIntake(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = intakeSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue.path[0] === "boarding_bringing" ? issue.message : "Couldn't save. Reload the page and try again." };
  }
  const phone = cleanPhone(parsed.data.phone ?? "");
  if (!phone.phone && !phone.error) return { error: "Type your phone number, so your walker can reach you about your pet" };
  if (phone.error) return { error: phone.error };

  // Dogs come in as dog[0][name], dog[0][breed], ...
  const dogs: Record<string, Record<string, string>> = {};
  for (const [k, v] of form.entries()) {
    const m = k.match(/^dog\[(\d+)\]\[(\w+)\]$/);
    if (m) (dogs[m[1]] ??= {})[m[2]] = String(v);
  }
  // Check every pet before saving anything, so one plain line says what to fix.
  const pets: { raw: Record<string, string>; data: z.infer<typeof dogSchema> }[] = [];
  for (const raw of Object.values(dogs)) {
    const d = dogSchema.safeParse(raw);
    if (!d.success) return { error: "Couldn't save. Reload the page and try again." };
    const name = d.data.name.trim();
    if (!name) {
      // A blank "add another pet" box is just left out; one with answers needs a name.
      const hasAnswers = Object.entries(raw).some(([k, v]) => k !== "name" && k !== "b_vet_release" && String(v).trim());
      if (d.data.id || hasAnswers) return { error: "Type your pet's name" };
      continue;
    }
    if (d.data.weight_lbs?.trim() && toNumber(d.data.weight_lbs) == null) {
      return { error: `${name}'s weight: a number like 40` };
    }
    const vet = cleanPhone(d.data.vet_phone ?? "");
    if (vet.error) return { error: `${name}'s vet phone: ${vet.error.replace(/^Phone: /, "").replace(/^T/, "t")}` };
    pets.push({ raw, data: { ...d.data, name, vet_phone: vet.phone ?? "" } });
  }

  const { supabase, user } = await requireRole("client");
  const { client_id, boarding_bringing, ...contact } = parsed.data;

  const { error } = await supabase
    .from("clients")
    .update({ ...contact, phone: phone.phone, boarding_bringing: boarding_bringing?.trim() || null, intake_completed_at: new Date().toISOString() })
    .eq("id", client_id)
    .eq("profile_id", user.id);
  if (error) return { error: friendly(error) };
  // Finding the address on the map can take a few seconds: do it after the page moves on.
  after(() => saveClientCoordinates(supabase, client_id, contact.address_line, contact.city));

  const { data: clientRow } = await supabase.from("clients").select("walker_id").eq("id", client_id).single();
  for (const { raw, data } of pets) {
    const { id, weight_lbs, birthdate, vet_phone, ...rest } = data;
    // Boarding answers come in as dog[i][b_feeding], ... (the same pet profile, an extra section).
    const boarding: Record<string, string | boolean> = {};
    for (const f of PET_BOARDING_FIELDS) {
      const v = (raw[`b_${f.key}`] ?? "").trim().slice(0, 1000);
      if (v) boarding[f.key] = v;
    }
    boarding.vet_release = raw.b_vet_release === "on";
    const payload = {
      ...rest,
      vet_phone: vet_phone || null,
      weight_lbs: weight_lbs?.trim() ? toNumber(weight_lbs) : null,
      birthdate: birthdate || null,
      boarding,
    };
    const { error: petErr } = id
      ? await supabase.from("dogs").update(payload).eq("id", id)
      : await supabase.from("dogs").insert({ ...payload, client_id, walker_id: clientRow!.walker_id });
    if (petErr) return { error: `Your details saved, but ${payload.name || "a pet"} didn't. Tap Save again.` };
  }

  revalidatePath("/my");
  redirect("/my");
}

export async function markHomework(id: string, status: "in_progress" | "done", response?: string): Promise<{ error?: string }> {
  const { supabase } = await requireRole("client");
  const { error } = await supabase.from("homework").update({ status, client_response: response ?? null }).eq("id", id);
  if (error) return { error: friendly(error, "Didn't save. Try again.") };
  revalidatePath("/my");
  return {};
}
