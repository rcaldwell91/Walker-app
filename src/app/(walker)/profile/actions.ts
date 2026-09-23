"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/session";

export type ProfileState = { error?: string; saved?: number } | undefined;

const profileSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your name"),
  business_name: z.string().trim().max(120).optional(),
  bio: z.string().trim().max(2000, "Keep the bio under 2,000 characters").optional(),
  service_area: z.string().trim().max(200).optional(),
  check_in_cadence_days: z.coerce.number().int().min(7, "Check-ins at most weekly").max(365, "At least once a year"),
});

export async function saveProfile(_: ProfileState, form: FormData): Promise<ProfileState> {
  const parsed = profileSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const { supabase, user } = await requireRole("walker", "operator");

  // Services: svc_enabled[<id>], svc_rate[<id>] (dollars), svc_duration[<id>] (minutes)
  const rows: { walker_id: string; service_type_id: string; rate_cents: number; duration_min: number | null; enabled: boolean }[] = [];
  const ids = new Set<string>();
  for (const k of form.keys()) {
    const m = k.match(/^svc_rate\[(.+)\]$/);
    if (m) ids.add(m[1]);
  }
  for (const id of ids) {
    const rateRaw = String(form.get(`svc_rate[${id}]`) ?? "").trim();
    const enabled = form.get(`svc_enabled[${id}]`) === "on";
    if (!rateRaw) {
      if (enabled) return { error: "Add a rate for each service you offer" };
      continue;
    }
    const rate = Number(rateRaw);
    if (!Number.isFinite(rate) || rate < 0 || rate > 10000) return { error: "Rates should be dollar amounts, like 25 or 27.50" };
    const dur = Number(String(form.get(`svc_duration[${id}]`) ?? "")) || null;
    if (dur !== null && (dur < 5 || dur > 1440)) return { error: "Durations are 5 to 1,440 minutes" };
    rows.push({ walker_id: user.id, service_type_id: id, rate_cents: Math.round(rate * 100), duration_min: dur, enabled });
  }

  const [{ error: pErr }, { error: wErr }] = await Promise.all([
    supabase.from("profiles").update({ full_name: d.full_name }).eq("id", user.id),
    supabase
      .from("walkers")
      .update({
        business_name: d.business_name ?? "",
        bio: d.bio ?? "",
        service_area: d.service_area ?? "",
        check_in_cadence_days: d.check_in_cadence_days,
        suggestion_box_enabled: form.get("suggestion_box_enabled") === "on",
        tips_enabled: form.get("tips_enabled") === "on",
      })
      .eq("id", user.id),
  ]);
  if (pErr || wErr) return { error: (pErr ?? wErr)!.message };
  if (rows.length) {
    const { error } = await supabase.from("walker_services").upsert(rows, { onConflict: "walker_id,service_type_id" });
    if (error) return { error: error.message };
  }
  revalidatePath("/profile");
  return { saved: Date.now() };
}

/** Called after the browser uploads a photo to avatars/{userId}/… */
export async function setAvatar(publicUrl: string) {
  const { supabase, user } = await requireRole("walker", "operator");
  const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${user.id}/`;
  if (!publicUrl.startsWith(prefix)) return { error: "That photo isn't yours" };
  const { error } = await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);
  revalidatePath("/profile");
  return error ? { error: error.message } : {};
}

/** Called after the browser uploads proof to documents/{userId}/… Resets verification (see migration 0009). */
export async function setBackgroundCheck(path: string) {
  const { supabase, user } = await requireRole("walker", "operator");
  if (!path.startsWith(`${user.id}/`) || path.includes("..")) return { error: "That file isn't yours" };
  const { error } = await supabase.from("walkers").update({ background_check_path: path }).eq("id", user.id);
  revalidatePath("/profile");
  return error ? { error: error.message } : {};
}
