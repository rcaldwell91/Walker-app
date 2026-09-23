"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { getTimeZone } from "@/lib/timezone";
import { addDays, isDateKey } from "@/lib/time";
import { isSeriesDay, occurrencesBetween, type BookingException } from "@/lib/schedule";

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
  refresh();
  revalidatePath(`/schedule/${bookingId}`);
  return { done: Date.now() };
}

export async function respondToCoverage(requestId: string, accept: boolean) {
  const { supabase } = await requireRole("walker");
  const { error } = await supabase.from("coverage_requests").update({ status: accept ? "accepted" : "declined" }).eq("id", requestId);
  refresh();
  revalidatePath(`/cover/${requestId}`);
  if (error) redirect(`/cover/${requestId}?error=${encodeURIComponent(error.message)}`);
}

/** Either walker can cancel an open or accepted cover. The day goes back to needing coverage. */
export async function cancelCoverage(requestId: string) {
  const { supabase } = await requireRole("walker");
  const { error } = await supabase.from("coverage_requests").update({ status: "cancelled" }).eq("id", requestId);
  refresh();
  revalidatePath(`/cover/${requestId}`);
  if (error) redirect(`/cover/${requestId}?error=${encodeURIComponent(error.message)}`);
}
