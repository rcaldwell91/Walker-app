"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { isDateKey } from "@/lib/time";

export type TimeOffState = { error?: string; done?: number } | undefined;

export async function addTimeOff(_: TimeOffState, form: FormData): Promise<TimeOffState> {
  const from = String(form.get("starts_on") ?? "");
  const to = String(form.get("ends_on") ?? "") || from;
  const note = String(form.get("note") ?? "").trim().slice(0, 200) || null;
  if (!isDateKey(from) || !isDateKey(to)) return { error: "Pick the first and last day you're away" };
  if (to < from) return { error: "The last day comes after the first" };
  const { supabase, user } = await requireRole("walker", "operator");
  const { error } = await supabase.from("walker_time_off").insert({ walker_id: user.id, starts_on: from, ends_on: to, note });
  if (error) return { error: error.message };
  revalidatePath("/hours");
  revalidatePath("/schedule");
  return { done: Date.now() };
}

export async function removeTimeOff(id: string) {
  const { supabase, user } = await requireRole("walker", "operator");
  await supabase.from("walker_time_off").delete().eq("id", id).eq("walker_id", user.id);
  revalidatePath("/hours");
  revalidatePath("/schedule");
}
