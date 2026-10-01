"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { dateKey, isDateKey } from "@/lib/time";
import { getTimeZone } from "@/lib/timezone";
import { friendly } from "@/lib/errors";

export type TimeOffState = { error?: string; done?: number } | undefined;

export async function addTimeOff(_: TimeOffState, form: FormData): Promise<TimeOffState> {
  const from = String(form.get("starts_on") ?? "").trim();
  const to = String(form.get("ends_on") ?? "").trim() || from;
  const note = String(form.get("note") ?? "").trim().slice(0, 200) || null;
  if (!isDateKey(from)) return { error: "Pick the first day you're away" };
  if (!isDateKey(to)) return { error: "Pick the last day you're away, or leave it blank for one day" };
  if (from < dateKey(new Date(), await getTimeZone())) return { error: "Pick a first day from today on" };
  if (to < from) return { error: "The last day comes after the first" };
  const { supabase, user } = await requireRole("walker", "operator");
  const { error } = await supabase.from("walker_time_off").insert({ walker_id: user.id, starts_on: from, ends_on: to, note });
  if (error) return { error: friendly(error) };
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
