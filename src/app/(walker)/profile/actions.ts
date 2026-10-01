"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase/server";
import { friendly } from "@/lib/errors";
import { HANDLE_RE, cleanHandle, cleanPhone, handleCandidate } from "@/lib/input";

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
  const phone = cleanPhone(String(form.get("phone") ?? ""));
  if (!phone.phone && !phone.error) return { error: "Type your phone number. Your clients and backup walkers use it to reach you" };
  if (phone.error) return { error: phone.error };
  const { supabase, user } = await requireRole("walker", "operator");

  const [{ error: pErr }, { error: wErr }] = await Promise.all([
    supabase.from("profiles").update({ full_name: d.full_name, phone: phone.phone }).eq("id", user.id),
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
  if (pErr || wErr) return { error: friendly((pErr ?? wErr)!) };
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
  return error ? { error: friendly(error) } : {};
}

/** Called after the browser uploads proof to documents/{userId}/… Resets verification (see migration 0009). */
export async function setBackgroundCheck(path: string) {
  const { supabase, user } = await requireRole("walker", "operator");
  if (!path.startsWith(`${user.id}/`) || path.includes("..")) return { error: "That file isn't yours" };
  const { error } = await supabase.from("walkers").update({ background_check_path: path }).eq("id", user.id);
  revalidatePath("/profile");
  return error ? { error: friendly(error) } : {};
}

/** A photo of the walker's boarding space, already uploaded to avatars/{userId}/space-*.jpg. */
export async function addSpacePhoto(path: string, caption: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireRole("walker", "operator");
  if (!path.startsWith(`${user.id}/space-`)) return { error: "That upload isn't yours" };
  const { error } = await supabase.from("walker_space_photos").insert({ walker_id: user.id, storage_path: path, caption: caption.trim().slice(0, 120) || null });
  if (error) return { error: friendly(error) };
  revalidatePath("/profile");
  return {};
}

export async function removeSpacePhoto(id: string) {
  const { supabase, user } = await requireRole("walker", "operator");
  const { data } = await supabase.from("walker_space_photos").delete().eq("id", id).eq("walker_id", user.id).select("storage_path").maybeSingle();
  if (data?.storage_path) await supabase.storage.from("avatars").remove([data.storage_path]);
  revalidatePath("/profile");
}

export type HandleState = { error?: string; saved?: number; handle?: string } | undefined;

/** "Your public page link": tidied as typed (capitals, spaces), checked, saved. */
export async function saveHandle(_: HandleState, form: FormData): Promise<HandleState> {
  const handle = cleanHandle(String(form.get("handle") ?? ""));
  if (handle.length < 3) return { error: "Use at least 3 letters or numbers, like your name" };
  if (!HANDLE_RE.test(handle)) return { error: "Use letters, numbers and dashes only" };
  const { supabase, user } = await requireRole("walker", "operator");
  const { error } = await supabase.from("walkers").update({ handle }).eq("id", user.id);
  if (error?.code === "23505") {
    // Public pages are public, so saying which link is free gives nothing away.
    const { data: taken } = await createServiceClient().from("walkers").select("handle").like("handle", `${handle.slice(0, 26)}%`);
    const used = new Set((taken ?? []).map((t) => t.handle));
    let n = 2;
    while (used.has(handleCandidate(handle, n))) n++;
    return { error: `Someone already has that link. Try ${handleCandidate(handle, n)}` };
  }
  if (error) return { error: friendly(error) };
  revalidatePath("/profile");
  return { saved: Date.now(), handle };
}
