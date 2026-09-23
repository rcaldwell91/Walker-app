"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { isValidTimeZone, isDateKey, mondayOf, zonedToUtc } from "@/lib/time";
import { isSeriesDay, occurrencesBetween } from "@/lib/schedule";
import { addDays, fmtDateKey } from "@/lib/time";
import { getTimeZone } from "@/lib/timezone";
import { notify } from "@/lib/notify";
import { fmtDate, fmtTime } from "@/lib/format";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * After one day of a booking changes, bring that day's covers along (the
 * database moves or cancels them) and tell each covering walker in-app.
 */
async function followCovers(
  supabase: SupabaseClient,
  booking: { id: string },
  day: string,
  change: { skipped: true } | { startsAt: Date; durationMin: number },
  tz: string,
  fromName: string,
) {
  const skipped = "skipped" in change;
  const { data } = await supabase.rpc("reschedule_coverage", {
    p_booking: booking.id,
    p_occurs_on: day,
    p_starts_at: skipped ? null : change.startsAt.toISOString(),
    p_duration: skipped ? null : change.durationMin,
    p_skipped: skipped,
  });
  const when = "startsAt" in change ? `${fmtDate(change.startsAt, tz)} at ${fmtTime(change.startsAt, tz)}` : "";
  for (const r of (data ?? []) as { request_id: string; to_walker_id: string; status: string; change: string }[]) {
    await notify([r.to_walker_id], {
      kind: "coverage",
      title: r.change === "cancelled" ? "Cover cancelled" : "Covered walk moved",
      body:
        r.change === "cancelled"
          ? `${fromName} skipped ${fmtDateKey(day)}, so the cover is off.`
          : `${fromName} moved the ${fmtDateKey(day)} walk to ${when}.`,
      url: `/cover/${r.request_id}`,
    });
  }
}

export type ActionState = { error?: string } | undefined;

const bookingSchema = z.object({
  client_id: z.string().uuid("Pick a client"),
  service_type_id: z.string().uuid("Pick a service"),
  date: z.string().refine(isDateKey, "Pick a date"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Pick a time"),
  duration_min: z.coerce.number().int().min(5, "At least 5 minutes").max(1440, "At most 24 hours"),
  repeat_until: z.string().optional(),
  tz: z.string().refine(isValidTimeZone, "Unknown time zone"),
});

/** Create (id = null) or update a booking. */
export async function saveBooking(id: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  const parsed = bookingSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const repeatWeekdays = Array.from(new Set(form.getAll("repeat_weekday").map(Number)))
    .filter((n) => n >= 1 && n <= 7)
    .sort();
  const dogIds = form.getAll("dog_id").map(String).filter(Boolean);
  const repeatUntil = repeatWeekdays.length && isDateKey(d.repeat_until) ? d.repeat_until : null;
  if (repeatUntil && repeatUntil < d.date) return { error: "Repeat-until has to be after the first day" };
  if (!dogIds.length) return { error: "Pick at least one dog" };

  const { supabase, user } = await requireRole("walker", "operator");

  // The client and dogs have to be this walker's.
  const { data: client } = await supabase
    .from("clients")
    .select("id, dogs(id)")
    .eq("id", d.client_id)
    .eq("walker_id", user.id)
    .maybeSingle();
  if (!client) return { error: "That client isn't on your list" };
  const ownDogs = new Set((client.dogs ?? []).map((x) => x.id));
  if (dogIds.some((x) => !ownDogs.has(x))) return { error: "Those dogs don't belong to that client" };

  const row = {
    walker_id: user.id,
    client_id: d.client_id,
    service_type_id: d.service_type_id,
    starts_at: zonedToUtc(d.date, Number(d.time.slice(0, 2)), Number(d.time.slice(3)), d.tz).toISOString(),
    duration_min: d.duration_min,
    repeat_weekdays: repeatWeekdays,
    repeat_until: repeatUntil,
  };

  let bookingId = id;
  if (id) {
    const { error } = await supabase.from("bookings").update(row).eq("id", id);
    if (error) return { error: error.message };
    const { error: delErr } = await supabase.from("booking_dogs").delete().eq("booking_id", id);
    if (delErr) return { error: delErr.message };
  } else {
    const { data, error } = await supabase.from("bookings").insert(row).select("id").single();
    if (error || !data) return { error: error?.message ?? "Couldn't save" };
    bookingId = data.id;
  }
  const { error: dogErr } = await supabase
    .from("booking_dogs")
    .insert(dogIds.map((dog_id) => ({ booking_id: bookingId!, dog_id })));
  if (dogErr) return { error: `Saved, but the dogs didn't attach: ${dogErr.message}` };

  revalidatePath("/schedule");
  revalidatePath("/home");
  redirect(`/schedule?week=${mondayOf(d.date)}`);
}

export async function setBookingCancelled(id: string, cancelled: boolean) {
  const { supabase } = await requireRole("walker", "operator");
  await supabase.from("bookings").update({ status: cancelled ? "cancelled" : "scheduled" }).eq("id", id);
  revalidatePath("/schedule");
  revalidatePath(`/schedule/${id}`);
  revalidatePath("/home");
}

/** Checks that `day` is a real occurrence of this walker's repeating booking. */
async function seriesOccurrence(bookingId: string, day: string, tz: string) {
  const { supabase, user } = await requireRole("walker", "operator");
  const { data: b } = await supabase
    .from("bookings")
    .select("id, walker_id, starts_at, duration_min, repeat_weekdays, repeat_until")
    .eq("id", bookingId)
    .eq("walker_id", user.id)
    .maybeSingle();
  if (!b || !b.repeat_weekdays?.length || !isDateKey(day) || !isValidTimeZone(tz) || !isSeriesDay(b, day, tz)) return null;
  return { supabase, user, booking: b };
}

async function myName(supabase: SupabaseClient, id: string) {
  const { data } = await supabase.from("profiles").select("full_name").eq("id", id).maybeSingle();
  return data?.full_name || "Your squad member";
}

/** Skip one day of a repeating booking. */
export async function skipOccurrence(bookingId: string, day: string, tz: string) {
  const ok = await seriesOccurrence(bookingId, day, tz);
  if (!ok) return;
  await ok.supabase.from("booking_exceptions").upsert(
    { booking_id: bookingId, walker_id: ok.user.id, occurs_on: day, skipped: true, moved_to: null, duration_min: null },
    { onConflict: "booking_id,occurs_on" },
  );
  await followCovers(ok.supabase, ok.booking, day, { skipped: true }, tz, await myName(ok.supabase, ok.user.id));
  revalidatePath("/schedule");
  revalidatePath("/home");
  revalidatePath(`/schedule/${bookingId}`);
}

const moveSchema = z.object({
  date: z.string().refine(isDateKey, "Pick a date"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Pick a time"),
  duration_min: z.coerce.number().int().min(5).max(1440),
  tz: z.string().refine(isValidTimeZone, "Unknown time zone"),
});

/** Move one occurrence of a repeating booking to another date/time. */
export async function moveOccurrence(bookingId: string, day: string, _: ActionState, form: FormData): Promise<ActionState> {
  const parsed = moveSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const ok = await seriesOccurrence(bookingId, day, d.tz);
  if (!ok) return { error: "That day isn't part of this booking's repeats" };
  const movedTo = zonedToUtc(d.date, Number(d.time.slice(0, 2)), Number(d.time.slice(3)), d.tz);
  const { error } = await ok.supabase.from("booking_exceptions").upsert(
    {
      booking_id: bookingId,
      walker_id: ok.user.id,
      occurs_on: day,
      skipped: false,
      moved_to: movedTo.toISOString(),
      duration_min: d.duration_min,
    },
    { onConflict: "booking_id,occurs_on" },
  );
  if (error) return { error: error.message };
  await followCovers(ok.supabase, ok.booking, day, { startsAt: movedTo, durationMin: d.duration_min }, d.tz, await myName(ok.supabase, ok.user.id));
  revalidatePath("/schedule");
  revalidatePath("/home");
  redirect(`/schedule?week=${mondayOf(d.date)}`);
}

/** Put one occurrence back the way the series has it. */
export async function clearOccurrenceChange(bookingId: string, day: string) {
  const { supabase, user } = await requireRole("walker", "operator");
  await supabase.from("booking_exceptions").delete().eq("booking_id", bookingId).eq("occurs_on", day);
  // Covers go back to the series time for that day.
  const tz = await getTimeZone();
  const { data: b } = await supabase
    .from("bookings")
    .select("id, starts_at, duration_min, repeat_weekdays, repeat_until")
    .eq("id", bookingId)
    .eq("walker_id", user.id)
    .maybeSingle();
  const occ = b && isDateKey(day) ? occurrencesBetween([b], day, addDays(day, 1), tz)[0] : null;
  if (b && occ) await followCovers(supabase, b, day, { startsAt: occ.at, durationMin: occ.durationMin }, tz, await myName(supabase, user.id));
  revalidatePath("/schedule");
  revalidatePath("/home");
  revalidatePath(`/schedule/${bookingId}`);
}
