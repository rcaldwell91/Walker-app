"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";

export type ActionState = { error?: string; ok?: boolean } | undefined;

export async function updateDog(dogId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireRole("walker", "operator");
  const fields = ["name", "breed", "medications", "allergies", "quirks", "working_on", "progress_summary", "vet_name", "vet_phone"] as const;
  const payload: Record<string, string | null> = {};
  for (const f of fields) {
    if (form.has(f)) payload[f] = String(form.get(f)).trim() || (f === "working_on" || f === "progress_summary" || f === "name" ? "" : null);
  }
  if (payload.name === "") return { error: "Dog needs a name" };
  const { error } = await supabase.from("dogs").update(payload).eq("id", dogId);
  if (error) return { error: error.message };
  revalidatePath(`/dogs/${dogId}`);
  return { ok: true };
}

export async function assignHomework(dogId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const title = String(form.get("title") ?? "").trim();
  if (!title) return { error: "What should they work on?" };
  const { supabase, user } = await requireRole("walker", "operator");
  const { error } = await supabase.from("homework").insert({
    dog_id: dogId,
    walker_id: user.id,
    title,
    instructions: String(form.get("instructions") ?? "").trim() || null,
    due_at: String(form.get("due_at") ?? "") || null,
  });
  if (error) return { error: error.message };
  revalidatePath(`/dogs/${dogId}`);
  return { ok: true };
}
