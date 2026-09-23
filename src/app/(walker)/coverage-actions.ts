"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { getTimeZone } from "@/lib/timezone";
import { addDays, isDateKey } from "@/lib/time";
import { isSeriesDay, occurrencesBetween, type BookingException } from "@/lib/schedule";
import { clientProfileId, notify } from "@/lib/notify";
import { fmtDate, fmtTime } from "@/lib/format";
import type { SupabaseClient } from "@supabase/supabase-js";

type CoverRow = { id: string; from_walker_id: string; to_walker_id: string; client_id: string; client_name: string; dog_names: string | null; starts_at: string; from_name: string; to_name: string; status: string };
async function coverRow(supabase: SupabaseClient, id: string) {
  const { data } = await supabase.rpc("my_coverage");
  return ((data ?? []) as CoverRow[]).find((r) => r.id === id) ?? null;
}

export type CoverState = { error?: string; done?: number } | undefined;

function refresh() {
  revalidatePath("/home");
  revalidatePath("/schedule");
}

/** Walker nudges their client to approve one squad member. */
export async function askClientApproval(clientId: string, coverageWalkerId: string) {
  const { supabase, user } = await requireRole("walker");
  await supabase.from("coverage_approval_asks").upsert(
    { walker_id: user.id, client_id: clientId, coverage_walker_id: coverageWalkerId, asked_at: new Date().toISOString(), answered_at: null },
    { onConflict: "client_id,coverage_walker_id" },
  );
  revalidatePath(`/clients/${clientId}`);
}

/** Ask a squad member to cover one occurrence (booking + its series day). */
export async function requestCoverage(bookingId: string, day: string, _: CoverState, form: FormData): Promise<CoverState> {
  const toWalker = String(form.get("to_walker_id") ?? "");
  const message = String(form.get("message") ?? "").trim().slice(0, 500) || null;
  if (!toWalker) return { error: "Pick who to ask" };
  if (!isDateKey(day)) return { error: "Pick a day" };
  const { supabase, user } = await requireRole("walker");
  const tz = await getTimeZone();

  // Where that occurrence actually is (it may have been moved), and that it isn't skipped.
  const { data: b } = await supabase
    .from("bookings")
    .select("id, starts_at, duration_min, repeat_weekdays, repeat_until, walker_id")
    .eq("id", bookingId)
    .eq("walker_id", user.id)
    .maybeSingle();
  if (!b || !isSeriesDay(b, day, tz)) return { error: "That day isn't part of this booking" };
  const { data: ex } = await supabase
    .from("booking_exceptions")
    .select("booking_id, occurs_on, skipped, moved_to, duration_min")
    .eq("booking_id", bookingId)
    .eq("occurs_on", day);
  const exceptions = (ex ?? []) as BookingException[];
  if (exceptions[0]?.skipped) return { error: "That day is skipped" };
  const moved = exceptions[0]?.moved_to;
  const occ = moved
    ? { at: new Date(moved), durationMin: exceptions[0].duration_min ?? b.duration_min }
    : occurrencesBetween([b], day, addDays(day, 1), tz)[0];
  if (!occ) return { error: "That day isn't part of this booking" };

  const { error } = await supabase.from("coverage_requests").insert({
    booking_id: bookingId,
    from_walker_id: user.id,
    to_walker_id: toWalker,
    occurs_on: day,
    starts_at: occ.at.toISOString(),
    duration_min: occ.durationMin,
    tz,
    message,
  });
  if (error) return { error: /row-level security/i.test(error.message) ? "The client hasn't approved that walker yet" : error.message };
  const { data: me } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  await notify([toWalker], {
    kind: "coverage",
    title: `${me?.full_name ?? "Your squad"} needs coverage`,
    body: `${fmtDate(occ.at, tz)} at ${fmtTime(occ.at, tz)}${message ? ` · “${message}”` : ""}`,
    url: "/home",
  });
  refresh();
  revalidatePath(`/schedule/${bookingId}`);
  return { done: Date.now() };
}

export async function respondToCoverage(requestId: string, accept: boolean) {
  const { supabase } = await requireRole("walker");
  const tz = await getTimeZone();
  const { error } = await supabase.from("coverage_requests").update({ status: accept ? "accepted" : "declined" }).eq("id", requestId);
  const r = error ? null : await coverRow(supabase, requestId);
  if (r) {
    const when = `${fmtDate(r.starts_at, tz)} at ${fmtTime(r.starts_at, tz)}`;
    await notify([r.from_walker_id], {
      kind: "coverage",
      title: accept ? `${r.to_name} is covering` : `${r.to_name} can't cover`,
      body: `${r.dog_names ?? "Walk"} · ${r.client_name} · ${when}`,
      url: `/cover/${r.id}`,
    });
    // The database already posted the client's notice as a message; push it.
    if (accept) {
      await notify([await clientProfileId(r.client_id)], {
        kind: "message",
        title: "Your walk is covered",
        body: `${r.to_name} is covering ${r.dog_names ?? "your dog"}'s walk on ${fmtDate(r.starts_at, tz)}.`,
        url: "/my/messages",
      });
    }
  }
  refresh();
  revalidatePath(`/cover/${requestId}`);
  if (error) redirect(`/cover/${requestId}?error=${encodeURIComponent(error.message)}`);
}

/** Either walker can cancel an open or accepted cover. The day goes back to needing coverage. */
export async function cancelCoverage(requestId: string) {
  const { supabase, user } = await requireRole("walker");
  const tz = await getTimeZone();
  const before = await coverRow(supabase, requestId);
  const { error } = await supabase.from("coverage_requests").update({ status: "cancelled" }).eq("id", requestId);
  if (!error && before && (before.status === "accepted" || before.status === "open")) {
    const other = before.from_walker_id === user.id ? before.to_walker_id : before.from_walker_id;
    const who = before.from_walker_id === user.id ? before.from_name : before.to_name;
    await notify([other], {
      kind: "coverage",
      title: before.status === "accepted" ? "Cover cancelled" : "Coverage request withdrawn",
      body: `${who} cancelled ${before.dog_names ?? "the walk"} · ${fmtDate(before.starts_at, tz)} at ${fmtTime(before.starts_at, tz)}`,
      url: `/cover/${before.id}`,
    });
  }
  refresh();
  revalidatePath(`/cover/${requestId}`);
  if (error) redirect(`/cover/${requestId}?error=${encodeURIComponent(error.message)}`);
}
