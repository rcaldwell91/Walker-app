"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/session";

export type ActionState = { error?: string } | undefined;

const intakeSchema = z.object({
  client_id: z.string().uuid(),
  phone: z.string().optional(),
  address_line: z.string().optional(),
  city: z.string().optional(),
  emergency_contact: z.string().optional(),
  home_access_notes: z.string().optional(),
});

const dogSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
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
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { supabase, user } = await requireRole("client");
  const { client_id, ...contact } = parsed.data;

  const { error } = await supabase
    .from("clients")
    .update({ ...contact, intake_completed_at: new Date().toISOString() })
    .eq("id", client_id)
    .eq("profile_id", user.id);
  if (error) return { error: error.message };

  // Dogs come in as dog[0][name], dog[0][breed], ...
  const dogs: Record<string, Record<string, string>> = {};
  for (const [k, v] of form.entries()) {
    const m = k.match(/^dog\[(\d+)\]\[(\w+)\]$/);
    if (m) (dogs[m[1]] ??= {})[m[2]] = String(v);
  }
  const { data: clientRow } = await supabase.from("clients").select("walker_id").eq("id", client_id).single();
  for (const raw of Object.values(dogs)) {
    const d = dogSchema.safeParse(raw);
    if (!d.success || !d.data.name.trim()) continue;
    const { id, weight_lbs, birthdate, ...rest } = d.data;
    const payload = {
      ...rest,
      weight_lbs: weight_lbs ? Number(weight_lbs) : null,
      birthdate: birthdate || null,
    };
    if (id) await supabase.from("dogs").update(payload).eq("id", id);
    else await supabase.from("dogs").insert({ ...payload, client_id, walker_id: clientRow!.walker_id });
  }

  revalidatePath("/my");
  redirect("/my");
}

export async function markHomework(id: string, status: "in_progress" | "done", response?: string) {
  const { supabase } = await requireRole("client");
  await supabase.from("homework").update({ status, client_response: response ?? null }).eq("id", id);
  revalidatePath("/my");
}
