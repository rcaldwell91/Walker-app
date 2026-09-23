/**
 * In-app notifications + Web Push. Server only.
 *
 * notify() writes a row to `notifications` (the in-app list) for each person,
 * then sends a push to each of their devices unless they turned that kind off.
 * Uses the service role: the sender can't read the recipient's subscriptions.
 * Sending never throws; a failed push never blocks the action that caused it.
 */

import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/server";

import type { PushKind } from "./push-kinds";
export { PUSH_KINDS, type PushKind } from "./push-kinds";

export type Notice = { kind: PushKind; title: string; body: string; url: string };

let configured: boolean | null = null;
function vapidReady() {
  if (configured !== null) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  configured = !!(pub && priv);
  if (configured) webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:notifications@walker-app.invalid", pub!, priv!);
  return configured;
}

export type NotifyResult = { notified: number; pushed: number; failed: number };

export async function notify(userIds: (string | null | undefined)[], n: Notice): Promise<NotifyResult> {
  const ids = Array.from(new Set(userIds.filter((x): x is string => !!x)));
  const result: NotifyResult = { notified: 0, pushed: 0, failed: 0 };
  if (!ids.length) return result;
  try {
    const admin = createServiceClient();
    const { error } = await admin
      .from("notifications")
      .insert(ids.map((user_id) => ({ user_id, kind: n.kind, title: n.title, body: n.body, url: n.url })));
    if (!error) result.notified = ids.length;
    if (!vapidReady()) return result;

    const [{ data: prefs }, { data: subs }] = await Promise.all([
      admin.from("profiles").select("id, notify_off").in("id", ids),
      admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", ids),
    ]);
    const off = new Set((prefs ?? []).filter((p) => (p.notify_off ?? []).includes(n.kind)).map((p) => p.id));
    const payload = JSON.stringify({ title: n.title, body: n.body, url: n.url, kind: n.kind });
    await Promise.all(
      (subs ?? [])
        .filter((s) => !off.has(s.user_id))
        .map(async (s) => {
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
              TTL: 60 * 60 * 24,
              timeout: 8000,
            });
            result.pushed++;
            await admin.from("push_subscriptions").update({ last_success_at: new Date().toISOString() }).eq("id", s.id);
          } catch (e) {
            result.failed++;
            const code = (e as { statusCode?: number }).statusCode;
            // Gone or unknown to the push service: the browser unsubscribed.
            if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
          }
        }),
    );
  } catch {
    // Notifications are best-effort.
  }
  return result;
}

/** Profile id (login) of a client row, if they've joined. */
export async function clientProfileId(clientId: string): Promise<string | null> {
  const { data } = await createServiceClient().from("clients").select("profile_id").eq("id", clientId).maybeSingle();
  return data?.profile_id ?? null;
}

/** Who cares about a walk: its dogs' owners (with logins) and their walkers, minus whoever walked it. */
export async function walkAudience(walkId: string) {
  const admin = createServiceClient();
  const { data } = await admin
    .from("walks")
    .select("walker_id, walk_dogs(dog:dogs(walker_id, client:clients(id, profile_id)))")
    .eq("id", walkId)
    .maybeSingle();
  const owners: string[] = [];
  const walkers: string[] = [];
  const clients: { id: string; profile_id: string | null }[] = [];
  for (const wd of data?.walk_dogs ?? []) {
    const dog = Array.isArray(wd.dog) ? wd.dog[0] : wd.dog;
    const client = dog && (Array.isArray(dog.client) ? dog.client[0] : dog.client);
    if (client?.profile_id) owners.push(client.profile_id);
    if (client) clients.push(client);
    if (dog && dog.walker_id !== data?.walker_id) walkers.push(dog.walker_id);
  }
  return { owners: Array.from(new Set(owners)), otherWalkers: Array.from(new Set(walkers)), clients };
}

/** Check-ins just opened by open_due_check_ins(): tell each client once. */
export async function notifyOpenedCheckIns(rows: { id: string; client_id: string; notified_at: string | null }[] | null) {
  const fresh = (rows ?? []).filter((r) => !r.notified_at);
  if (!fresh.length) return;
  const admin = createServiceClient();
  // Claim them first so two page loads don't both send.
  const { data: claimed } = await admin
    .from("check_ins")
    .update({ notified_at: new Date().toISOString() })
    .in("id", fresh.map((r) => r.id))
    .is("notified_at", null)
    .select("id, client_id");
  for (const c of claimed ?? []) {
    await notify([await clientProfileId(c.client_id)], {
      kind: "checkin",
      title: "Check-in time",
      body: "A few quick questions from your walker. Takes a minute.",
      url: "/my",
    });
  }
}
