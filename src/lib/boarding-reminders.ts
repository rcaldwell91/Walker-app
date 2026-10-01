import { addDays, dateKey, fmtDateKey } from "./time";
import { clientProfileId, notify } from "./notify";
import { createServiceClient } from "./supabase/server";

/**
 * "Boarding starts tomorrow" / "ends tomorrow", for the walker and the client.
 * Worked out on page load (no cron): claim_stay_reminders() marks each one
 * sent in the same statement, so two page loads never both send it. It's
 * service-role only (0025); `userId` is the signed-in person from the session,
 * and it only claims that person's own stays. Callers run it with after(), so
 * nobody waits on it: everything here uses the service client, never the
 * request's cookies.
 */
export async function sendStayReminders(userId: string, tz: string) {
  const tomorrow = addDays(dateKey(new Date(), tz), 1);
  const admin = createServiceClient();
  const { data: due, error } = await admin.rpc("claim_stay_reminders", { p_actor: userId, p_tomorrow: tomorrow });
  if (error || !due?.length) return;
  const rows = due as { stay_id: string; kind: "start" | "end"; walker_id: string; client_id: string }[];
  // Only the stays just claimed for this person.
  const { data: stays } = await admin
    .from("boarding_stays")
    .select("id, start_day, end_day, starts_at, ends_at, client:clients(name), stay_pets(dog:dogs(name))")
    .in("id", rows.map((r) => r.stay_id));
  const byId = new Map((stays ?? []).map((s) => [s.id, s]));
  for (const r of rows) {
    const s = byId.get(r.stay_id);
    const pets = (s?.stay_pets ?? []).map((sp) => (Array.isArray(sp.dog) ? sp.dog[0] : sp.dog)?.name).filter(Boolean).join(" & ") || "Your pet";
    const client = s && (Array.isArray(s.client) ? s.client[0] : s.client);
    const when = fmtDateKey(tomorrow);
    if (r.kind === "start") {
      await notify([r.walker_id], { kind: "boarding", title: `Boarding starts tomorrow: ${pets}`, body: `${client?.name ?? "A client"} drops off ${when}.`, url: `/boarding/${r.stay_id}` });
      await notify([await clientProfileId(r.client_id)], { kind: "boarding", title: `${pets}'s stay starts tomorrow`, body: `Drop-off is ${when}. Check the boarding details are up to date.`, url: `/my/stays/${r.stay_id}` });
    } else {
      await notify([r.walker_id], { kind: "boarding", title: `Boarding ends tomorrow: ${pets}`, body: `${client?.name ?? "A client"} picks up ${when}.`, url: `/boarding/${r.stay_id}` });
      await notify([await clientProfileId(r.client_id)], { kind: "boarding", title: `${pets}'s stay ends tomorrow`, body: `Pick-up is ${when}.`, url: `/my/stays/${r.stay_id}` });
    }
  }
}
