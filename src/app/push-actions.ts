"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { PUSH_KINDS, type PushKind } from "@/lib/push-kinds";
import { friendly } from "@/lib/errors";

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };

/** Save this device's push subscription for the signed-in person. */
export async function savePushSubscription(sub: Sub, userAgent?: string) {
  const s = await getSession();
  if (!s) return { error: "Not signed in" };
  if (!/^https:\/\//.test(sub?.endpoint ?? "") || !sub.keys?.p256dh || !sub.keys?.auth) return { error: "Bad subscription" };
  // One row per endpoint; a device that changes hands moves to its new owner.
  await s.supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  const { error } = await s.supabase.from("push_subscriptions").insert({
    user_id: s.user.id,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    user_agent: (userAgent ?? "").slice(0, 300) || null,
  });
  return error ? { error: friendly(error) } : { ok: true };
}

export async function removePushSubscription(endpoint: string) {
  const s = await getSession();
  if (!s) return;
  await s.supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

/** Save which kinds of push this person has turned off. */
export async function setNotifyOff(onKinds: string[]): Promise<{ error?: string }> {
  const s = await getSession();
  if (!s) return { error: "Log in again to change this." };
  const on = new Set(onKinds);
  const off = PUSH_KINDS.map((k) => k.key).filter((k) => !on.has(k)) as PushKind[];
  const { error } = await s.supabase.from("profiles").update({ notify_off: off }).eq("id", s.user.id);
  if (error) return { error: friendly(error, "Didn't save. Tap it again.") };
  revalidatePath("/profile");
  revalidatePath("/my/more");
  return {};
}

/** Opened from the home screen: stop showing the walkthrough. */
export async function markInstalled() {
  const s = await getSession();
  if (!s) return;
  await s.supabase.from("profiles").update({ app_installed_at: new Date().toISOString() }).eq("id", s.user.id).is("app_installed_at", null);
}

export async function dismissInstallGuide() {
  const s = await getSession();
  if (!s) return;
  await s.supabase.from("profiles").update({ install_guide_dismissed_at: new Date().toISOString() }).eq("id", s.user.id);
}

/** Mark in-app notifications read. */
export async function markNotificationsRead(ids: string[]) {
  const s = await getSession();
  if (!s || !ids.length) return;
  await s.supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids).is("read_at", null);
  revalidatePath("/home");
  revalidatePath("/my");
}
